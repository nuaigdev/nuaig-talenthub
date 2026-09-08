import { z } from 'zod'
import { NOTICE_PERIODS, STATUSES } from './constants'

/**
 * One schema set, used in two places:
 *   - the client wizard, for per-step gating and inline error messages;
 *   - the submit route, which re-parses the whole payload from scratch.
 *
 * The server never trusts that the client ran these (spec.md §12). Sharing the
 * definitions keeps the two in sync; it does not make the client authoritative.
 */

const trimmed = (max: number) => z.string().trim().max(max)

const requiredText = (label: string, max: number) =>
  trimmed(max).min(1, `${label} is required`)

export const personalInfoSchema = z.object({
  fullName: requiredText('Full name', 120).regex(
    /[A-Za-z]/,
    'Please enter your name',
  ),
  email: requiredText('Email', 200).email('Please enter a valid email address'),
  phone: requiredText('Phone', 40).regex(
    /^[+()\-\s\d]{7,40}$/,
    'Please enter a valid phone number',
  ),
  location: requiredText('City / location', 120),
  linkedIn: z
    .union([
      z.literal(''),
      z.string().trim().url('Please enter a valid URL').max(300),
    ])
    .optional()
    .transform((value) => value || ''),
})

const positionFields = z.object({
    // Not an enum any more: positions are rows in a SharePoint list that
    // recruiters manage, so the set is not known at compile time. The submit
    // route checks the value against the live list — see `isOfferedPosition`.
    position: requiredText('Position', 150),
    yearsExperience: z
      .number({ invalid_type_error: 'Please enter your years of experience' })
      .min(0, 'Total experience cannot be negative')
      .max(60, 'Please enter a realistic number of years'),
    relevantExperience: z
      .number({ invalid_type_error: 'Please enter your relevant experience' })
      .min(0, 'Relevant experience cannot be negative')
      .max(60, 'Please enter a realistic number of years'),
    currentCTC: trimmed(60).optional().default(''),
    expectedCTC: trimmed(60).optional().default(''),
    noticePeriod: z.enum(NOTICE_PERIODS, {
      errorMap: () => ({ message: 'Please select a notice period' }),
    }),
})

/**
 * Relevant experience is a subset of total experience by definition. Applied as
 * a refinement on both schemas below rather than baked into `positionFields`,
 * because a refined schema is a ZodEffects and can no longer be `.merge()`d.
 */
const relevantWithinTotal = [
  (value: { relevantExperience: number; yearsExperience: number }) =>
    value.relevantExperience <= value.yearsExperience,
  {
    message: 'Relevant experience cannot exceed your total experience',
    path: ['relevantExperience'] as const,
  },
] as const

export const positionSchema = positionFields.refine(relevantWithinTotal[0], {
  ...relevantWithinTotal[1],
  path: [...relevantWithinTotal[1].path],
})

/** What the browser reports after finishing a direct-to-Microsoft upload. */
export const uploadedFileSchema = z.object({
  itemId: z.string().min(1),
  fileName: z.string().min(1).max(260),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive(),
})

export const submissionSchema = personalInfoSchema
  .merge(positionFields)
  .extend({
    resume: uploadedFileSchema,
    video: uploadedFileSchema,
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Consent is required to submit your application' }),
    }),
    /** Issued when the draft folder was created; ties the upload to this submission. */
    draftToken: z.string().min(1),
  })
  .refine(relevantWithinTotal[0], {
    ...relevantWithinTotal[1],
    path: [...relevantWithinTotal[1].path],
  })

export type PersonalInfo = z.infer<typeof personalInfoSchema>
export type PositionInfo = z.infer<typeof positionSchema>
export type UploadedFile = z.infer<typeof uploadedFileSchema>
export type SubmissionPayload = z.infer<typeof submissionSchema>

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
