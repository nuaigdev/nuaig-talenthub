'use server'

import { revalidatePath } from 'next/cache'
import { requireRecruiter } from '@/lib/recruiter-session'
import { appendNote, changeStatus } from '@/lib/graph/candidates'
import { noteSchema, statusChangeSchema } from '@/lib/validation'
import { publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Recruiter mutations (spec.md §10.2).
 *
 * Both actions re-authorize from scratch — a server action is a public HTTP
 * endpoint, so the middleware redirect and the page-level check upstream count
 * for nothing here (§12). The recruiter's identity comes from the validated
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
