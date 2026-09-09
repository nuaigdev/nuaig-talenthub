import { NextResponse } from 'next/server'
import { fieldErrors, submissionSchema } from '@/lib/validation'
import {
  assertItemInDraft,
  candidateFolderPath,
  ensureFolderPath,
  moveItem,
  readFilePrefix,
  tryDeleteItem,
  verifyDraftToken,
} from '@/lib/graph/drive'
import { nextCandidateId } from '@/lib/graph/counters'
import { createCandidate, deleteCandidateItem, findRecentDuplicate } from '@/lib/graph/candidates'
import { sendCandidateConfirmation } from '@/lib/graph/mail'
import { isOfferedPosition } from '@/lib/graph/positions'
import { candidateFolderName, storageFileName } from '@/lib/sanitize'
import { matchesDeclaredType } from '@/lib/file-signature'
import { uploadEnv } from '@/lib/env'
import { AppError, publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { RATE_LIMITS, clientIp, enforceRateLimit } from '@/lib/rate-limit'

/**
 * Finalises an application (spec.md §9).
 *
 * Order matters and is taken straight from the spec: validate, duplicate-check,
 * reserve the ID, create the folder, move the already-uploaded files in, create
 * the list item, then mail the candidate. Everything before the list item is
 * reversible; once the list item exists the application is real, so the
 * confirmation email is explicitly allowed to fail without failing the request.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

/** Files already uploaded to the draft folder, tracked for cleanup on failure. */
type Placed = { itemId: string; label: 'resume' | 'video' }

export async function POST(request: Request) {
  const ip = clientIp(request)
  let candidateId: string | undefined
  const placed: Placed[] = []
  let folderId: string | undefined
  let listItemId: string | undefined

  try {
    const body = await request.json()

    // 1. Full server-side validation. The client validated too; that is a UX
    //    affordance, not a trust boundary (§12).
    const parsed = submissionSchema.safeParse(body)
    if (!parsed.success) {
      logger.warn('Submission rejected by validation', {
        operation: 'submit_application',
        category: 'VALIDATION_FAILED',
        fields: Object.keys(fieldErrors(parsed.error)),
      })
      return NextResponse.json(
        {
          error: 'Some of the information provided is invalid. Please review the form and try again.',
          category: 'VALIDATION_FAILED',
          fields: fieldErrors(parsed.error),
        },
        { status: 400 },
      )
    }

    const input = parsed.data
    enforceRateLimit('submit', [ip, input.email.toLowerCase()], RATE_LIMITS.submit)

    const draftId = verifyDraftToken(input.draftToken)

    // Positions are recruiter-managed rows rather than a fixed enum, so the
    // schema can only check that a string was sent. This is where it is checked
    // against what is actually on offer — the client's dropdown is a
    // convenience, never the authority (§12).
    if (!(await isOfferedPosition(input.position))) {
      throw new AppError('VALIDATION_FAILED', `Position not offered: ${input.position}`, {
        publicMessage: 'That position is no longer open. Please choose another and try again.',
      })
    }

    // 2. Duplicate protection: same email + same position inside the window
    //    (§3 decision 1). Runs before anything is created.
    const duplicate = await findRecentDuplicate(input.email, input.position)
    if (duplicate) {
      logger.warn('Duplicate submission blocked', {
        operation: 'submit_application',
        category: 'DUPLICATE_SUBMISSION',
        candidateId: duplicate.candidateId,
        position: input.position,
      })
      throw new AppError(
        'DUPLICATE_SUBMISSION',
        `Duplicate of ${duplicate.candidateId} within the window`,
      )
    }

    // 3. Confirm both uploads belong to this submission, and that their bytes
    //    match what was declared. A file that lies about its type never reaches
    //    a candidate record.
    for (const [label, file] of [
      ['resume', input.resume],
      ['video', input.video],
    ] as const) {
      await assertItemInDraft(file.itemId, draftId)
      placed.push({ itemId: file.itemId, label })

      const allowed =
        label === 'resume' ? uploadEnv.allowedResumeTypes : uploadEnv.allowedVideoTypes
      if (!allowed.includes(file.contentType)) {
        throw new AppError('VALIDATION_FAILED', `Disallowed ${label} type ${file.contentType}`)
      }

      const prefix = await readFilePrefix(file.itemId)
      if (!matchesDeclaredType(prefix, file.contentType)) {
        throw new AppError(
          'VALIDATION_FAILED',
          `${label} bytes do not match declared type ${file.contentType}`,
          {
            publicMessage: `Your ${label} file does not appear to be a valid ${
              label === 'resume' ? 'document' : 'video'
            }. Please upload a different file.`,
          },
        )
      }
    }

    // 4. Reserve the candidate ID. Guaranteed unique (§8).
    const now = new Date()
    candidateId = await nextCandidateId(now)

    // 5. Create the destination folder and move the uploads into it. Moving is
    //    a metadata PATCH, so a successful upload is never re-transferred.
    const year = String(now.getFullYear())
    const folderPath = candidateFolderPath(year, candidateFolderName(candidateId, input.fullName))
    const folder = await ensureFolderPath(folderPath)
    folderId = folder.id

    const resumeItem = await moveItem(
      input.resume.itemId,
      folder.id,
      storageFileName('resume', input.resume.contentType),
    )
    const videoItem = await moveItem(
      input.video.itemId,
      folder.id,
      storageFileName('video', input.video.contentType),
    )

    // 6. Create the list item — the point at which the application becomes real.
    const candidate = await createCandidate({
      candidateId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      location: input.location,
      linkedIn: input.linkedIn,
      position: input.position,
      yearsExperience: input.yearsExperience,
      relevantExperience: input.relevantExperience,
      currentCTC: input.currentCTC,
      expectedCTC: input.expectedCTC,
      noticePeriod: input.noticePeriod,
      resumeUrl: resumeItem.webUrl,
      videoUrl: videoItem.webUrl,
      applicationDate: now.toISOString(),
    })
    listItemId = candidate.itemId

    logger.info('Application submitted', {
      operation: 'submit_application',
      candidateId,
      position: input.position,
    })

    // 7. Confirmation email. Never throws — the application is already recorded,
    //    so a mail outage must not tell the candidate to retry (§3 decision 6).
    const emailed = await sendCandidateConfirmation({
      candidateId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      location: input.location,
      linkedIn: input.linkedIn,
      position: input.position,
      yearsExperience: input.yearsExperience,
      relevantExperience: input.relevantExperience,
      currentCTC: input.currentCTC,
      expectedCTC: input.expectedCTC,
      noticePeriod: input.noticePeriod,
      applicationDate: now.toISOString(),
      // File sizes, not names: storage names are normalised, so echoing them
      // back would show the candidate a filename they never chose.
      resumeBytes: input.resume.size,
      videoBytes: input.video.size,
    })

    // 8. The candidate gets their ID and nothing else — no SharePoint URL, no
    //    internal identifier (§9).
    return NextResponse.json({ candidateId, emailSent: emailed })
  } catch (error) {
    const appError = toAppError(error, 'LIST_ITEM_CREATE_FAILED')

    // Roll back whatever we created, most-recent-first. Cleanup failure is
    // reported as ORPHANED_FILES with the path so an admin can finish the job;
    // it never replaces the original error (§9).
    await rollback({ appError, candidateId, listItemId, folderId, placed })

    logger.error('Application submission failed', appError, {
      operation: 'submit_application',
      category: appError.category,
      candidateId,
      ip,
    })

    return NextResponse.json(
      { error: publicMessageFor(appError), category: appError.category },
      { status: appError.status },
    )
  }
}

async function rollback(input: {
  appError: AppError
  candidateId?: string
  listItemId?: string
  folderId?: string
  placed: Placed[]
}): Promise<void> {
  const { appError, candidateId, listItemId, folderId, placed } = input

  // A failure after the list item exists is the worst case: undo it so the
  // candidate is not half-registered.
  if (listItemId) {
    try {
      await deleteCandidateItem(listItemId)
    } catch (cleanupError) {
      logger.error('Failed to remove partially created list item', cleanupError, {
        operation: 'submit_rollback',
        category: 'ORPHANED_FILES',
        candidateId,
        listItemId,
      })
    }
  }

  // Deleting the candidate folder removes the moved files with it.
  if (folderId) {
    const deleted = await tryDeleteItem(folderId)
    if (!deleted) {
      logger.error('Orphaned candidate folder left behind', appError, {
        operation: 'submit_rollback',
        category: 'ORPHANED_FILES',
        candidateId,
        folderId,
      })
    }
    return
  }

  // Nothing was moved yet, so the uploads are still in the draft folder. They
  // are deliberately left there: the candidate is being shown a retry, and
  // §9 requires an already-uploaded resume to be reused rather than re-sent.
  if (placed.length && appError.category !== 'DUPLICATE_SUBMISSION') {
    logger.info('Draft uploads retained for retry', {
      operation: 'submit_rollback',
      candidateId,
      retained: placed.map((entry) => entry.label),
    })
  }
}
