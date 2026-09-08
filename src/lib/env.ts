import 'server-only'

/**
 * Server-only environment access.
 *
 * Every read is lazy. Nothing here runs at module-eval time, so `next build`
 * succeeds on a machine with no credentials — a missing variable only fails the
 * request that actually needs it. None of these values may ever be imported
 * from a client component (spec.md §12); the `server-only` guard makes that a
 * build error rather than a silent secret leak into the client bundle.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback
}

function numeric(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function csv(name: string, fallback: string): string[] {
  return optional(name, fallback)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export const graphEnv = {
  get tenantId() {
    return required('MICROSOFT_TENANT_ID')
  },
  get clientId() {
    return required('MICROSOFT_CLIENT_ID')
  },
  get clientSecret() {
    return required('MICROSOFT_CLIENT_SECRET')
  },
}

export const sharePointEnv = {
  get siteId() {
    return required('SHAREPOINT_SITE_ID')
  },
  get driveId() {
    return required('SHAREPOINT_DRIVE_ID')
  },
  get candidatesListId() {
    return required('SHAREPOINT_CANDIDATES_LIST_ID')
  },
  get countersListId() {
    return required('SHAREPOINT_COUNTERS_LIST_ID')
  },
  get recruitersListId() {
    return required('SHAREPOINT_RECRUITERS_LIST_ID')
  },
  /** Library-relative root under which candidate year folders are created. */
  get candidatesRoot() {
    return optional('SHAREPOINT_CANDIDATES_ROOT', 'Candidates')
  },
}

export const mailEnv = {
  get confirmationMailbox() {
    return required('CONFIRMATION_MAILBOX_UPN')
  },
}

export const uploadEnv = {
  get maxResumeBytes() {
    return numeric('MAX_RESUME_SIZE_MB', 10) * 1024 * 1024
  },
  get maxVideoBytes() {
    return numeric('MAX_VIDEO_SIZE_MB', 500) * 1024 * 1024
  },
  get allowedResumeTypes() {
    return csv(
      'ALLOWED_RESUME_TYPES',
      'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
  },
  get allowedVideoTypes() {
    return csv('ALLOWED_VIDEO_TYPES', 'video/mp4,video/quicktime')
  },
}

export const policyEnv = {
  get duplicateWindowDays() {
    return numeric('DUPLICATE_WINDOW_DAYS', 90)
  },
}
