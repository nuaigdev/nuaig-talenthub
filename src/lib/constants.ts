/**
 * Shared vocabulary for the whole app. Safe to import from client components —
 * nothing here is secret. The values must stay in sync with the SharePoint
 * Choice columns described in spec.md §7.2 and documented in SHAREPOINT_SETUP.md.
 */

/**
 * Seed positions, and only a fallback. The live list comes from the `Positions`
 * SharePoint list, which recruiters manage themselves (`lib/graph/positions.ts`).
 * These are used when that list is not configured yet, and when reading it
 * fails — the public application form must still render.
 */
export const DEFAULT_POSITIONS = [
  'Data Lead',
  'Data Engineer',
  'Data Analyst',
  'AI Engineer',
  'Automation Lead',
  'Automation Engineer',
  'Business Analyst',
  'Other',
] as const

/** A position is free-form text now, not a closed union — recruiters add them. */
export type Position = string

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

/**
 * Sections of the single-page application form.
 *
 * These were five separate wizard steps; the form is now one page with a
 * section rail that tracks scroll position, so `id` doubles as the anchor and
 * the scroll-spy key.
 */
export const APPLY_SECTIONS = [
  {
    id: 'personal',
    label: 'Personal information',
    blurb: 'Tell us how to reach you.',
  },
  {
    id: 'position',
    label: 'Position',
    blurb: 'Which role are you applying for?',
  },
  {
    id: 'resume',
    label: 'Resume',
    blurb: 'Upload your most recent resume.',
  },
  {
    id: 'video',
    label: 'Introduction video',
    blurb: 'Record a short introduction so we can get to know you.',
  },
  {
    id: 'consent',
    label: 'Review & consent',
    blurb: 'Check your details and confirm your submission.',
  },
] as const

export type ApplySectionId = (typeof APPLY_SECTIONS)[number]['id']

export const DASHBOARD_PAGE_SIZE = 25

export const CONSENT_TEXT =
  'I consent to my information and submitted documents being used for recruitment purposes and stored by the company.'

export const VIDEO_INSTRUCTIONS =
  "Please upload a 2–4 minute introduction video. Tell us your name, current role, key experience and why you're interested in this position."

export function isStatus(value: string): value is CandidateStatus {
  return (STATUSES as readonly string[]).includes(value)
}
