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

/**
 * The office location candidates are asked about. The form offers this or
 * "Other"; choosing Other reveals a free-text city and the relocation question.
 * Named rather than inlined so opening a second office is one edit.
 */
export const HOME_CITY = 'Indore'

export const LOCATION_CHOICES = [HOME_CITY, 'Other'] as const

export const YES_NO = ['Yes', 'No'] as const

export type YesNo = (typeof YES_NO)[number]

export const HIGHEST_QUALIFICATIONS = [
  'Diploma',
  "Bachelor's degree",
  "Master's degree",
  'Doctorate (PhD)',
  'Other',
] as const

export type HighestQualification = (typeof HIGHEST_QUALIFICATIONS)[number]

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

/**
 * The pipeline, as stage plus optional round.
 *
 * Interview, Selected and Rejected happen at a specific round, so they carry a
 * level; the rest are single points and do not. Rather than model that as a
 * second column, a status is stored as one composite string — "Interview L2" —
 * which keeps `Status` a single readable value in SharePoint, keeps the
 * append-only history log honest, and lets a stage filter match every round
 * under it with a prefix match.
 */
export const STATUS_STAGES = [
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

export type StatusStage = (typeof STATUS_STAGES)[number]

/** Stages that happen at a round, and so take an L1/L2/L3 suffix. */
export const LEVELLED_STAGES = ['Interview', 'Selected', 'Rejected'] as const

export const STATUS_LEVELS = ['L1', 'L2', 'L3'] as const

export type StatusLevel = (typeof STATUS_LEVELS)[number]

export function stageTakesLevel(stage: string): boolean {
  return (LEVELLED_STAGES as readonly string[]).includes(stage)
}

export function formatStatus(stage: string, level?: string | null): string {
  return stageTakesLevel(stage) && level ? `${stage} ${level}` : stage
}

/** Splits a stored status back into its parts. Unknown values fall back to New. */
export function parseStatus(value: string): { stage: StatusStage; level: StatusLevel | null } {
  const trimmed = (value ?? '').trim()

  for (const stage of STATUS_STAGES) {
    if (trimmed === stage) return { stage, level: null }
    if (stageTakesLevel(stage) && trimmed.startsWith(`${stage} `)) {
      const suffix = trimmed.slice(stage.length + 1).trim()
      if ((STATUS_LEVELS as readonly string[]).includes(suffix)) {
        return { stage, level: suffix as StatusLevel }
      }
    }
  }

  return { stage: 'New', level: null }
}

/** Every value the app will write — the exact vocabulary for the SharePoint column. */
export const STATUSES: string[] = STATUS_STAGES.flatMap((stage) =>
  stageTakesLevel(stage) ? STATUS_LEVELS.map((level) => `${stage} ${level}`) : [stage],
)

/** A status is a composite string, not a closed union. Parse it, don't switch on it. */
export type CandidateStatus = string

/** One hex per stage (spec.md §5.3). Rounds share their stage colour — the
 * level is a position within a stage, not a different kind of thing. */
export const STATUS_COLORS: Record<StatusStage, string> = {
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

/** Stages surfaced as dashboard tiles. Tiles count every round in the stage. */
export const SUMMARY_STAGES: StatusStage[] = [
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
    label: 'Role & experience',
    blurb: 'The role you want, and where you are today.',
  },
  {
    id: 'education',
    label: 'Education',
    blurb: 'Your qualifications and any certifications.',
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
    blurb: 'Referral details, then check everything and confirm.',
  },
] as const

export type ApplySectionId = (typeof APPLY_SECTIONS)[number]['id']

export const DASHBOARD_PAGE_SIZE = 25

export const CONSENT_TEXT =
  'I consent to my information and submitted documents being used for recruitment purposes and stored by the company.'

export const VIDEO_INSTRUCTIONS =
  "Please upload a 2–4 minute introduction video. Tell us your name, current role, key experience and why you're interested in this position."

export function isStatus(value: string): boolean {
  return STATUSES.includes(value)
}

/** Colour for a stored status, whatever round it names. */
export function statusColor(value: string): string {
  return STATUS_COLORS[parseStatus(value).stage]
}
