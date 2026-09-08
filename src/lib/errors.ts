/**
 * Error taxonomy from spec.md §13.
 *
 * `AppError` carries two messages: a `category` + technical `detail` that only
 * ever reaches the server log, and a `publicMessage` that is the *only* thing a
 * candidate is allowed to see. Route handlers serialise `publicMessage`; they
 * must never serialise `detail`, `cause`, or a raw Graph error.
 */

export const ERROR_CATEGORIES = [
  'VALIDATION_FAILED',
  'DUPLICATE_SUBMISSION',
  'UPLOAD_FAILED',
  'GRAPH_UNAVAILABLE',
  'LIST_ITEM_CREATE_FAILED',
  'ORPHANED_FILES',
  'AUTH_DENIED',
  'RATE_LIMITED',
] as const

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number]

const GENERIC_MESSAGE =
  'Your application could not be completed because of a temporary system issue. Please try again.'

/** Default candidate-facing copy per category. Deliberately non-technical. */
const PUBLIC_MESSAGES: Record<ErrorCategory, string> = {
  VALIDATION_FAILED: 'Some of the information provided is invalid. Please review the form and try again.',
  DUPLICATE_SUBMISSION:
    'You have already applied for this position recently. You are welcome to apply for a different role, or for this role again later.',
  UPLOAD_FAILED: 'Your file could not be uploaded. Please check your connection and try again.',
  GRAPH_UNAVAILABLE: GENERIC_MESSAGE,
  LIST_ITEM_CREATE_FAILED: GENERIC_MESSAGE,
  ORPHANED_FILES: GENERIC_MESSAGE,
  AUTH_DENIED: 'You do not have access to this area.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
}

const STATUS_CODES: Record<ErrorCategory, number> = {
  VALIDATION_FAILED: 400,
  DUPLICATE_SUBMISSION: 409,
  UPLOAD_FAILED: 502,
  GRAPH_UNAVAILABLE: 503,
  LIST_ITEM_CREATE_FAILED: 500,
  ORPHANED_FILES: 500,
  AUTH_DENIED: 403,
  RATE_LIMITED: 429,
}

export class AppError extends Error {
  readonly category: ErrorCategory
  readonly publicMessage: string
  readonly status: number
  readonly context: Record<string, unknown>

  constructor(
    category: ErrorCategory,
    detail: string,
    options: {
      publicMessage?: string
      context?: Record<string, unknown>
      cause?: unknown
    } = {},
  ) {
    super(detail, { cause: options.cause })
    this.name = 'AppError'
    this.category = category
    this.publicMessage = options.publicMessage ?? PUBLIC_MESSAGES[category]
    this.status = STATUS_CODES[category]
    this.context = options.context ?? {}
  }
}

/** Narrow an unknown thrown value into something loggable without leaking it. */
export function toAppError(error: unknown, fallbackCategory: ErrorCategory): AppError {
  if (error instanceof AppError) return error
  const detail = error instanceof Error ? error.message : String(error)
  return new AppError(fallbackCategory, detail, { cause: error })
}

export function publicMessageFor(error: unknown): string {
  return error instanceof AppError ? error.publicMessage : GENERIC_MESSAGE
}

export { GENERIC_MESSAGE }
