import { NextResponse } from 'next/server'
import { requireRecruiter } from '@/lib/recruiter-session'
import { getCandidateByCandidateId } from '@/lib/graph/candidates'
import { candidateFolderPath, findCandidateDocument, getDownloadUrl } from '@/lib/graph/drive'
import { candidateFolderName } from '@/lib/sanitize'
import { AppError, publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Brokers access to a candidate's resume or intro video (spec.md §10.2, §12).
 *
 * Recruiters never receive a SharePoint URL. This handler re-authorizes, locates
 * the file with app-only Graph credentials, mints a short-lived pre-authenticated
 * download URL, and redirects to it. The URL expires on its own and grants access
 * to exactly one file.
 *
 * The folder is resolved from the candidate's own record rather than from
 * anything in the request, so a recruiter cannot steer this at an arbitrary path.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ candidateId: string; kind: string }>

export async function GET(_request: Request, { params }: { params: Params }) {
  const { candidateId: rawId, kind } = await params
  const candidateId = decodeURIComponent(rawId)

  try {
    const recruiter = await requireRecruiter()

    if (kind !== 'resume' && kind !== 'video') {
      throw new AppError('VALIDATION_FAILED', `Unknown document kind: ${kind}`, {
        publicMessage: 'That document type is not recognised.',
      })
    }

    const candidate = await getCandidateByCandidateId(candidateId)
    if (!candidate) {
      throw new AppError('VALIDATION_FAILED', `Candidate not found: ${candidateId}`, {
        publicMessage: 'That candidate could not be found.',
      })
    }

    // Folder name is regenerated from stored data with the same sanitiser used
    // at write time, so it round-trips exactly (§7.1).
    const year = new Date(candidate.applicationDate).getFullYear()
    const folderPath = candidateFolderPath(
      String(year),
      candidateFolderName(candidate.candidateId, candidate.fullName),
    )

    const baseName = kind === 'resume' ? 'Resume' : 'Introduction'
    const item = await findCandidateDocument(folderPath, baseName)
    if (!item) {
      throw new AppError('VALIDATION_FAILED', `${baseName} missing for ${candidateId}`, {
        publicMessage: 'That document is no longer available.',
        context: { folderPath },
      })
    }

    const downloadUrl = await getDownloadUrl(item.id)

    logger.info('Document access granted', {
      operation: 'view_document',
      candidateId,
      kind,
      actor: recruiter.email,
    })

    // 302 rather than proxying the bytes: the video streams straight from
    // Microsoft with range support, and no large body crosses this function.
    return NextResponse.redirect(downloadUrl, {
      status: 302,
      headers: { 'Cache-Control': 'no-store, private' },
    })
  } catch (error) {
    const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
    logger.error('Document access failed', appError, {
      operation: 'view_document',
      category: appError.category,
      candidateId,
      kind,
    })
    return NextResponse.json({ error: publicMessageFor(appError) }, { status: appError.status })
  }
}
