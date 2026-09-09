import { z } from 'zod'
import { HIGHEST_QUALIFICATIONS, HOME_CITY, NOTICE_PERIODS, STATUSES, YES_NO } from './constants'

/**
 * One schema set, used in two places:
 *   - the client form, for inline error messages and section completion;
 *   - the submit route, which re-parses the whole payload from scratch.
 *
 * The server never trusts that the client ran these (spec.md §12). Sharing the
 * definitions keeps the two in sync; it does not make the client authoritative.
 *
 * Field groups are plain `z.object`s so they can be `.merge()`d. Cross-field
 * rules live in `CROSS_FIELD_RULES` and are applied to each exported schema,
 * because `.refine()` produces a ZodEffects that can no longer be merged.
 */

const trimmed = (max: number) => z.string().trim().max(max)

const requiredText = (label: string, max: number) =>
  trimmed(max).min(1, `${label} is required`)

const yesNo = (label: string) =>
  z.enum(YES_NO, { errorMap: () => ({ message: `Please answer "${label}"` }) })

/** Optional Yes/No — empty when the question does not apply to this candidate. */
const optionalYesNo = z.union([z.literal(''), z.enum(YES_NO)]).optional().default('')

const personalFields = z.object({
  fullName: requiredText('Full name', 120).regex(/[A-Za-z]/, 'Please enter your name'),
  email: requiredText('Email', 200).email('Please enter a valid email address'),
  phone: requiredText('Phone', 40).regex(
    /^[+()\-\s\d]{7,40}$/,
    'Please enter a valid phone number',
  ),
  /**
   * The resolved city. The form offers "Indore" or "Other"; picking Other
   * reveals a free-text box, and the resolved value is what is stored — so the
   * record and every filter keep working with a plain city name.
   */
  location: requiredText('City', 120),
  /** Only asked when the city is not the home city; blank otherwise. */
  willingToRelocate: optionalYesNo,
  linkedIn: z
    .string()
    .trim()
    .min(1, 'LinkedIn profile is required')
    .max(300)
    .url('Please enter a valid LinkedIn URL'),
})

const positionFields = z.object({
  // Not an enum: positions are rows in a SharePoint list that recruiters
  // manage, so the set is not known at compile time. The submit route checks
  // the value against the live list — see `isOfferedPosition`.
  position: requiredText('Position', 150),
  yearsExperience: z
    .number({ invalid_type_error: 'Please enter your years of experience' })
    .min(0, 'Total experience cannot be negative')
    .max(60, 'Please enter a realistic number of years'),
  relevantExperience: z
    .number({ invalid_type_error: 'Please enter your relevant experience' })
    .min(0, 'Relevant experience cannot be negative')
    .max(60, 'Please enter a realistic number of years'),

  currentlyEmployed: yesNo('Are you currently employed?'),
  /** Both only asked when currently employed; blank otherwise. */
  currentCompany: trimmed(150).optional().default(''),
  currentJobTitle: trimmed(150).optional().default(''),

  currentCTC: requiredText('Current CTC', 60),
  variableComponent: trimmed(60).optional().default(''),
  expectedCTC: requiredText('Expected CTC', 60),
  ctcNegotiable: yesNo('Is your expected CTC negotiable?'),
  noticePeriod: z.enum(NOTICE_PERIODS, {
    errorMap: () => ({ message: 'Please select a notice period' }),
  }),
  noticePeriodNegotiable: yesNo('Is your notice period negotiable?'),
})

const educationFields = z.object({
  highestQualification: z.enum(HIGHEST_QUALIFICATIONS, {
    errorMap: () => ({ message: 'Please select your highest qualification' }),
  }),
  undergraduateCollege: requiredText('Undergraduate college', 200),
  // Free text rather than a number: candidates report a CGPA out of 10, out of
  // 4, or a percentage, and forcing one shape would make some of them lie.
  undergraduateCGPA: requiredText('Undergraduate CGPA', 20),
  postgraduateCollege: trimmed(200).optional().default(''),
  postgraduateCGPA: trimmed(20).optional().default(''),
  certifications: trimmed(1000).optional().default(''),
})

const referralFields = z.object({
  /** Only supplied by candidates who came through a recruitment agency. */
  agencyCode: trimmed(60).optional().default(''),
})

// ---------------------------------------------------------------------------
// Cross-field rules
// ---------------------------------------------------------------------------

type CrossFieldShape = {
  yearsExperience: number
  relevantExperience: number
  location: string
  willingToRelocate: string
  currentlyEmployed: string
  currentCompany: string
  currentJobTitle: string
}

type Rule = {
  check: (value: CrossFieldShape) => boolean
  message: string
  path: string[]
}

const CROSS_FIELD_RULES: Rule[] = [
  {
    check: (v) => v.relevantExperience <= v.yearsExperience,
    message: 'Relevant experience cannot exceed your total experience',
    path: ['relevantExperience'],
  },
  {
    // Asked only of candidates outside the home city, so only required there.
    check: (v) => v.location.trim().toLowerCase() === HOME_CITY.toLowerCase() || !!v.willingToRelocate,
    message: `Please tell us whether you are willing to relocate to ${HOME_CITY}`,
    path: ['willingToRelocate'],
  },
  {
    check: (v) => v.currentlyEmployed !== 'Yes' || v.currentCompany.trim().length > 0,
    message: 'Please enter your current organisation',
    path: ['currentCompany'],
  },
  {
    check: (v) => v.currentlyEmployed !== 'Yes' || v.currentJobTitle.trim().length > 0,
    message: 'Please enter your current job title',
    path: ['currentJobTitle'],
  },
]

function withCrossFieldRules<T extends z.ZodTypeAny>(schema: T) {
  return CROSS_FIELD_RULES.reduce<z.ZodTypeAny>(
    (acc, rule) =>
      acc.superRefine((value: unknown, ctx: z.RefinementCtx) => {
        if (!rule.check(value as CrossFieldShape)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: rule.message, path: rule.path })
        }
      }),
    schema,
  )
}

// ---------------------------------------------------------------------------
// Exported schemas
// ---------------------------------------------------------------------------

/**
 * The whole form, minus the uploads. The client validates against this per
 * section; the shape carries every field the cross-field rules touch, so the
 * same rules run client-side and server-side.
 */
const detailsFields = personalFields
  .merge(positionFields)
  .merge(educationFields)
  .merge(referralFields)

export const detailsSchema = withCrossFieldRules(detailsFields)

/** What the browser reports after finishing a direct-to-Microsoft upload. */
export const uploadedFileSchema = z.object({
  itemId: z.string().min(1),
  fileName: z.string().min(1).max(260),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive(),
})

export const submissionSchema = withCrossFieldRules(
  detailsFields.extend({
    resume: uploadedFileSchema,
    video: uploadedFileSchema,
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Consent is required to submit your application' }),
    }),
    /** Issued when the draft folder was created; ties the upload to this submission. */
    draftToken: z.string().min(1),
  }),
) as z.ZodType<z.infer<typeof detailsFields> & SubmissionExtras>

type SubmissionExtras = {
  resume: z.infer<typeof uploadedFileSchema>
  video: z.infer<typeof uploadedFileSchema>
  consent: true
  draftToken: string
}

/**
 * The fields a recruiter may correct after submission. Deliberately excludes
 * the candidate ID, the uploaded files, and anything with its own audited flow
 * (status, notes) — those are not "typos to fix".
 */
export const candidateEditSchema = withCrossFieldRules(detailsFields)

export type CandidateDetails = z.infer<typeof detailsFields>
export type UploadedFile = z.infer<typeof uploadedFileSchema>
export type SubmissionPayload = CandidateDetails & SubmissionExtras

export const uploadSessionRequestSchema = z.object({
  kind: z.enum(['resume', 'video']),
  fileName: z.string().min(1).max(260),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive(),
  /** Present on every call after the first, so all files land in one draft folder. */
  draftToken: z.string().min(1).optional(),
})

export const noteSchema = z.object({
  text: z.string().trim().min(1, 'Note cannot be empty').max(4000, 'Note is too long'),
})

export const statusChangeSchema = z.object({
  status: z.enum(STATUSES, { errorMap: () => ({ message: 'Unknown status' }) }),
})

/** Flattens a ZodError into `{ field: message }` for inline form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form'
    if (!out[key]) out[key] = issue.message
  }
  return out
}
