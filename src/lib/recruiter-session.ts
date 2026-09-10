import 'server-only'
import { auth } from './auth'
import { findActiveRecruiter, type RecruiterRecord } from './graph/recruiters'
import { AppError } from './errors'
import { logger } from './logger'
import type { RecruiterRole } from './constants'

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
  /** From the Recruiters `Role` column. Admins are unrestricted by position. */
  role: RecruiterRole
  /** Convenience mirror of `role === 'admin'`. */
  isAdmin: boolean
}

/**
 * Why a caller is not an authorized recruiter.
 *
 * "Not signed in" and "signed in but not on the roster" call for completely
 * different responses — a sign-in prompt versus an admin request — so callers
 * need to tell them apart rather than lumping both into a denial.
 */
export type RecruiterState =
  | { state: 'anonymous' }
  | { state: 'unauthorized'; email: string }
  | { state: 'ok'; recruiter: RecruiterIdentity }

export async function getRecruiterState(): Promise<RecruiterState> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return { state: 'anonymous' }

  const record = await findActiveRecruiter(email)
  if (!record) {
    logger.warn('Authorized session for a non-active recruiter', {
      operation: 'recruiter_authorize',
      category: 'AUTH_DENIED',
      email,
    })
    return { state: 'unauthorized', email }
  }

  return {
    state: 'ok',
    recruiter: {
      email: record.email,
      displayName: session?.user?.displayName || record.displayName,
      role: record.role,
      isAdmin: record.role === 'admin',
    },
  }
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
    role: record.role,
    isAdmin: record.role === 'admin',
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
