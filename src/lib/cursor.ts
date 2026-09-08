import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Opaque pagination cursors.
 *
 * Graph's `@odata.nextLink` is a full URL containing the site id, list id and a
 * skiptoken. §12 forbids exposing SharePoint site/drive/list ids to any client,
 * so the link is never handed to the browser directly — it is encrypted here
 * and travels as an opaque token that only this server can open.
 *
 * AES-256-GCM also makes the cursor tamper-evident: a modified token fails
 * authentication and is rejected rather than being followed as a URL.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('Missing required environment variable: NEXTAUTH_SECRET')
  return createHash('sha256').update(`cursor:${secret}`).digest()
}

export function encodeCursor(nextLink: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const ciphertext = Buffer.concat([cipher.update(nextLink, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url')
}

/** Returns null for anything that is not a token we issued. */
export function decodeCursor(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length <= IV_BYTES + 16) return null

    const iv = raw.subarray(0, IV_BYTES)
    const tag = raw.subarray(IV_BYTES, IV_BYTES + 16)
    const ciphertext = raw.subarray(IV_BYTES + 16)

    const decipher = createDecipheriv(ALGORITHM, key(), iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')

    // Defence in depth: only ever follow a Graph URL back out of a cursor.
    return plaintext.startsWith('https://graph.microsoft.com/') ? plaintext : null
  } catch {
    return null
  }
}
