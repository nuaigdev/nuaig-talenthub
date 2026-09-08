import 'server-only'
import { auth } from './auth'
import { findActiveRecruiter, type RecruiterRecord } from './graph/recruiters'
import { AppError } from './errors'
import { logger } from './logger'

/**
 * The single authorization gate for everything under `/recruiter` (spec.md §12).
 *
 * Middleware only checks that a session cookie exists — it cannot call Graph on
 * the edge. This is the real check, and every recruiter page, route handler and
 * server action must call it *before* any Graph work. It re-validates both the
 * session and Recruiters-list membership on every single request, so
 * deactivating a recruiter in SharePoint takes effect within the list cache TTL
 * rather than at session expiry.
 */

export type RecruiterIdentity = {
  email: string
  displayName: string
}

export async function getRecruiter(): Promise<RecruiterIdentity | null> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return null

  const record: RecruiterRecord | null = await findActiveRecruiter(email)
  if (!record) {
    logger.warn('Authorized session for a non-active recruiter', {
      operation: 'recruiter_authorize',
      category: 'AUTH_DENIED',
      email,
    })
    return null
  }

  return {
    email: record.email,
    // Prefer the Entra display name; fall back to the list's.
    displayName: session?.user?.displayName || record.displayName,
  }
}

/** Throws `AUTH_DENIED` when the caller is not an active recruiter. */
export async function requireRecruiter(): Promise<RecruiterIdentity> {
  const recruiter = await getRecruiter()
  if (!recruiter) {
    throw new AppError('AUTH_DENIED', 'Caller is not an active recruiter')
  }
  return recruiter
}
