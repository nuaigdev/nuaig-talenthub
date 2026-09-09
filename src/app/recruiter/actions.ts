'use server'

import { revalidatePath } from 'next/cache'
import { requireRecruiter } from '@/lib/recruiter-session'
import { appendNote, changeStatus, updateCandidateDetails } from '@/lib/graph/candidates'
import { candidateEditSchema, fieldErrors, noteSchema, statusChangeSchema } from '@/lib/validation'
import { isOfferedPosition } from '@/lib/graph/positions'
import { publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Recruiter mutations (spec.md §10.2).
 *
 * Both actions re-authorize from scratch — a server action is a public HTTP
 * endpoint, so the layout's gate upstream counts for nothing here (§12). The recruiter's identity comes from the validated
 * session, never from the client payload, which is what makes the audit trail
 * trustworthy.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function addNoteAction(
  candidateId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const recruiter = await requireRecruiter()

    const parsed = noteSchema.safeParse({ text: formData.get('text') })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid note.' }
    }

    // Append-only: this never overwrites another recruiter's note (§3 decision 9).
    await appendNote(candidateId, {
      author: recruiter.displayName,
      authorEmail: recruiter.email,
      text: parsed.data.text,
    })

    logger.info('Recruiter note added', {
      operation: 'add_note',
      candidateId,
      actor: recruiter.email,
    })

    revalidatePath(`/recruiter/candidates/${candidateId}`)
    return { ok: true }
  } catch (error) {
    const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
    logger.error('Failed to add recruiter note', appError, {
      operation: 'add_note',
      category: appError.category,
      candidateId,
    })
    return { ok: false, error: publicMessageFor(appError) }
  }
}

/**
 * Corrects a candidate's own details, for when they tell us they mistyped
 * something. Re-validated against the same schema the public form uses, so a
 * recruiter cannot save a shape the application itself would have rejected.
 */
export async function updateCandidateAction(
  candidateId: string,
  values: Record<string, string>,
): Promise<ActionResult & { fields?: Record<string, string> }> {
  try {
    const recruiter = await requireRecruiter()

    const parsed = candidateEditSchema.safeParse({
      ...values,
      yearsExperience:
        values.yearsExperience === '' ? Number.NaN : Number(values.yearsExperience),
      relevantExperience:
        values.relevantExperience === '' ? Number.NaN : Number(values.relevantExperience),
    })

    if (!parsed.success) {
      return {
        ok: false,
        error: 'Some of these details are not valid. Please check the highlighted fields.',
        fields: fieldErrors(parsed.error),
      }
    }

    // A recruiter may only set a position that is actually on offer, same as a
    // candidate — otherwise the dashboard filter would have an orphan value.
    const details = parsed.data as Record<string, string | number>
    if (!(await isOfferedPosition(String(details.position)))) {
      return { ok: false, error: 'That position is not currently open.' }
    }

    const { changed } = await updateCandidateDetails(candidateId, details, {
      name: recruiter.displayName,
      email: recruiter.email,
    })

    logger.info('Candidate details corrected', {
      operation: 'update_candidate',
      candidateId,
      changed,
      actor: recruiter.email,
    })

    revalidatePath(`/recruiter/candidates/${candidateId}`)
    revalidatePath('/recruiter')
    return { ok: true }
  } catch (error) {
    const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
    logger.error('Failed to update candidate details', appError, {
      operation: 'update_candidate',
      category: appError.category,
      candidateId,
    })
    return { ok: false, error: publicMessageFor(appError) }
  }
}

export async function changeStatusAction(
  candidateId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const recruiter = await requireRecruiter()

    const parsed = statusChangeSchema.safeParse({ status: formData.get('status') })
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Unknown status.' }
    }

    // Appends to the history log and moves `Status` under an ETag guard.
    await changeStatus(candidateId, parsed.data.status, {
      name: recruiter.displayName,
      email: recruiter.email,
    })

    logger.info('Candidate status changed', {
      operation: 'change_status',
      candidateId,
      toStatus: parsed.data.status,
      actor: recruiter.email,
    })

    revalidatePath(`/recruiter/candidates/${candidateId}`)
    revalidatePath('/recruiter')
    return { ok: true }
  } catch (error) {
    const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
    logger.error('Failed to change candidate status', appError, {
      operation: 'change_status',
      category: appError.category,
      candidateId,
    })
    return { ok: false, error: publicMessageFor(appError) }
  }
}
