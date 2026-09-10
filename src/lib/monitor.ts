import 'server-only'
import { cookies } from 'next/headers'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { monitorEnv } from './env'

/**
 * Operations console access control.
 *
 * A private, read-only monitoring entrance, separate from the recruiter SSO
 * flow. It exists so an owner who has stepped back from day-to-day recruiting
 * can still glance at the whole pipeline, without holding a recruiter seat.
 *
 * The security model, deliberately:
 *   - Nothing secret is in this file. The URL segment, the username and the
 *     password *hash* all come from the environment (see monitorEnv). Reading
 *     this source tells you the mechanism exists; it does not let you in.
 *   - The password is verified against a scrypt hash — the plaintext is never
 *     stored anywhere, in the repo or the environment.
 *   - Auth is gated three ways: the request must hit the secret URL segment,
 *     present the right username + password, and thereafter carry a signed,
 *     tamper-evident session cookie. Login attempts are rate-limited by the
 *     caller.
 *   - When the environment is not configured the whole route 404s, so an
 *     unconfigured deployment reveals nothing.
 *
 * This is not a back door around authorization: it reaches the same data an
 * admin sees, through its own front door, and it cannot write anything.
 */

/** httpOnly session cookie for an authenticated console operator. */
export const MONITOR_COOKIE = 'nuaig_ops'

/** Console sessions are short — this is an occasional monitoring glance. */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 }
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

/** True only when every console variable is present — otherwise the route 404s. */
export function monitorConfigured(): boolean {
  return Boolean(monitorEnv.gate && monitorEnv.user && monitorEnv.passwordHash && monitorEnv.sessionSecret)
}

/** Constant-time string compare that does not leak length via early return. */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** True when the URL's secret segment matches the configured gate. */
export function gateMatches(candidate: string): boolean {
  const gate = monitorEnv.gate
  return Boolean(gate) && constantTimeEqual(candidate, gate as string)
}

/**
 * Verifies a login. The stored hash is `scrypt:<saltB64>:<hashB64>`. Username
 * and password are both checked constant-time; a mismatch of either fails
 * identically, so the response cannot be used to enumerate the username.
 */
export function verifyCredentials(username: string, password: string): boolean {
  const expectedUser = monitorEnv.user
  const stored = monitorEnv.passwordHash
  if (!expectedUser || !stored) return false

  const userOk = constantTimeEqual(username, expectedUser)

  const parts = stored.split(':')
  let passwordOk = false
  if (parts.length === 3 && parts[0] === 'scrypt') {
    try {
      const salt = Buffer.from(parts[1], 'base64')
      const expected = Buffer.from(parts[2], 'base64')
      const actual = scryptSync(password, salt, SCRYPT.keylen, {
        N: SCRYPT.N,
        r: SCRYPT.r,
        p: SCRYPT.p,
      })
      passwordOk = expected.length === actual.length && timingSafeEqual(expected, actual)
    } catch {
      passwordOk = false
    }
  }

  // Evaluate both before returning so timing does not reveal which failed.
  return userOk && passwordOk
}

function sessionKey(): Buffer {
  const secret = monitorEnv.sessionSecret
  if (!secret) throw new Error('Monitor session secret is not configured')
  return createHash('sha256').update(`monitor-session:${secret}`).digest()
}

function mintToken(): string {
  const payload = JSON.stringify({ sub: 'ops', exp: Date.now() + SESSION_TTL_MS })
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, sessionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url')
}

function tokenValid(token: string): boolean {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length <= IV_BYTES + 16) return false
    const iv = raw.subarray(0, IV_BYTES)
    const tag = raw.subarray(IV_BYTES, IV_BYTES + 16)
    const ciphertext = raw.subarray(IV_BYTES + 16)
    const decipher = createDecipheriv(ALGORITHM, sessionKey(), iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    const payload = JSON.parse(plaintext) as { sub?: string; exp?: number }
    return payload.sub === 'ops' && typeof payload.exp === 'number' && payload.exp > Date.now()
  } catch {
    return false
  }
}

/** Mints a session and sets the signed, httpOnly cookie. Call from an action/route. */
export async function establishSession(): Promise<void> {
  const store = await cookies()
  store.set(MONITOR_COOKIE, mintToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export async function endSession(): Promise<void> {
  const store = await cookies()
  store.delete(MONITOR_COOKIE)
}

/** True when the current request carries a valid, unexpired console session. */
export async function hasMonitorSession(): Promise<boolean> {
  if (!monitorConfigured()) return false
  const token = (await cookies()).get(MONITOR_COOKIE)?.value
  return Boolean(token) && tokenValid(token as string)
}
