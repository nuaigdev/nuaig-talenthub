import 'server-only'
import { AppError, type ErrorCategory } from './errors'

/**
 * Structured server-side logging (spec.md §13).
 *
 * One JSON line per event so Vercel's log drain can index it. Two hard rules:
 *   1. Nothing sensitive is ever logged — the redaction pass below strips any
 *      key that looks like auth material, at any depth.
 *   2. Candidate-facing text never comes from here; this is observability only.
 */

const REDACTED = '[redacted]'

const SENSITIVE_KEY = /(secret|token|password|authorization|credential|cookie|clientsecret|apikey)/i

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1))
  if (typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, depth + 1)
  }
  return out
}

type LogFields = {
  /** The business operation, e.g. `submit_application`, `update_status`. */
  operation: string
  candidateId?: string
  category?: ErrorCategory
  /** Graph request id, when the SDK surfaces one — the key to a support ticket. */
  correlationId?: string
  [key: string]: unknown
}

function emit(level: 'info' | 'warn' | 'error', message: string, fields: LogFields) {
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(redact(fields) as Record<string, unknown>),
  })

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  /** A completed operation. Pass `outcome` so success/failure rates are queryable. */
  info(message: string, fields: LogFields) {
    emit('info', message, { outcome: 'success', ...fields })
  },

  warn(message: string, fields: LogFields) {
    emit('warn', message, { outcome: 'failure', ...fields })
  },

  /**
   * Logs the full technical detail of a failure. The candidate sees
   * `error.publicMessage` instead — never this.
   */
  error(message: string, error: unknown, fields: LogFields) {
    const appError = error instanceof AppError ? error : undefined
    emit('error', message, {
      outcome: 'failure',
      ...fields,
      category: fields.category ?? appError?.category ?? 'GRAPH_UNAVAILABLE',
      detail: error instanceof Error ? error.message : String(error),
      ...(appError?.context ?? {}),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
    })
  },
}
