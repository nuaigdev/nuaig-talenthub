/**
 * Shared vocabulary for the whole app. Safe to import from client components —
 * nothing here is secret. The values must stay in sync with the SharePoint
 * Choice columns described in spec.md §7.2 and documented in SHAREPOINT_SETUP.md.
 */

export const POSITIONS = [
  'Data Lead',
  'Data Engineer',
  'Data Analyst',
  'AI Engineer',
  'Automation Lead',
  'Automation Engineer',
  'Business Analyst',
  'Other',
] as const

export type Position = (typeof POSITIONS)[number]

export const NOTICE_PERIODS = [
  'Immediate',
  '15 days',
  '30 days',
  '45 days',
  '60 days',
  '90 days',
  'Other',
] as const

export type NoticePeriod = (typeof NOTICE_PERIODS)[number]

export const STATUSES = [
  'New',
  'Screening',
  'Shortlisted',
  'Interview',
  'Selected',
  'Offer',
  'Joined',
  'Rejected',
  'On Hold',
] as const

export type CandidateStatus = (typeof STATUSES)[number]

/** spec.md §5.3 — one hex per status, rendered as a ~12% tinted pill. */
export const STATUS_COLORS: Record<CandidateStatus, string> = {
  New: '#069BDF',
  Screening: '#6B7280',
  Shortlisted: '#6366F1',
  Interview: '#D97706',
  Selected: '#0D9488',
  Offer: '#7C3AED',
  Joined: '#16A34A',
  Rejected: '#DC2626',
  'On Hold': '#9CA3AF',
}

/** Statuses surfaced as summary tiles on the dashboard (spec.md §10.1). */
export const SUMMARY_STATUSES: CandidateStatus[] = [
  'New',
  'Screening',
  'Shortlisted',
  'Interview',
  'Selected',
  'Joined',
  'Rejected',
]

export const APPLY_STEPS = [
  'Personal Info',
  'Position',
  'Resume',
  'Video',
  'Consent',
] as const

export const DASHBOARD_PAGE_SIZE = 25

export const CONSENT_TEXT =
  'I consent to my information and submitted documents being used for recruitment purposes and stored by the company.'

export const VIDEO_INSTRUCTIONS =
  "Please upload a 2–4 minute introduction video. Tell us your name, current role, key experience and why you're interested in this position."

export function isStatus(value: string): value is CandidateStatus {
  return (STATUSES as readonly string[]).includes(value)
}
