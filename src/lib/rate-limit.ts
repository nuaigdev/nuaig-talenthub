import 'server-only'
import { AppError } from './errors'

/**
 * Rate limiting for the public submission endpoints (spec.md §12).
 *
 * In-memory fixed windows, keyed by IP and by email. This is per serverless
 * instance, so it blunts abuse rather than enforcing a global quota — the
 * correct v1 trade-off given there is no Redis in the stack, and the real
 * backstop against duplicate applications is the 90-day duplicate check, which
 * is authoritative and storage-backed. Swap `hit()` for a Redis INCR/EXPIRE if
 * a hard global limit is ever needed.
 */

type Window = { count: number; resetAt: number }

const buckets = new Map<string, Window>()

/** Bounded so a stream of unique keys cannot grow the map without limit. */
const MAX_KEYS = 5_000

function sweep(now: number): void {
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key)
  }
  if (buckets.size > MAX_KEYS) {
    // Oldest-first eviction; Map preserves insertion order.
    const excess = buckets.size - MAX_KEYS
    let removed = 0
    for (const key of buckets.keys()) {
      buckets.delete(key)
      if (++removed >= excess) break
    }
  }
}

export type RateLimitRule = { limit: number; windowMs: number }

export const RATE_LIMITS = {
  /** Upload sessions are cheap but shouldn't be farmed for storage. */
  uploadSession: { limit: 20, windowMs: 10 * 60_000 } as RateLimitRule,
  /** Full submissions — deliberately tight. */
  submit: { limit: 5, windowMs: 60 * 60_000 } as RateLimitRule,
}

function hit(key: string, rule: RateLimitRule, now: number): boolean {
  const window = buckets.get(key)
  if (!window || window.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs })
    return true
  }
  window.count += 1
  return window.count <= rule.limit
}

/**
 * Throws `RATE_LIMITED` if any of `keys` is over its limit. All keys are
 * counted before the check so a blocked caller still accrues against every
 * bucket they touched.
 */
export function enforceRateLimit(scope: string, keys: string[], rule: RateLimitRule): void {
  const now = Date.now()
  sweep(now)

  const blocked = keys
    .filter(Boolean)
    .map((key) => hit(`${scope}:${key}`, rule, now))
    .some((allowed) => !allowed)

  if (blocked) {
    throw new AppError('RATE_LIMITED', `Rate limit exceeded for ${scope}`, {
      context: { scope },
    })
  }
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
