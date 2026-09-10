import { NextResponse } from 'next/server'
import { gateMatches, hasMonitorSession, monitorConfigured } from '@/lib/monitor'
import { getCandidateByCandidateId } from '@/lib/graph/candidates'
import { candidateFolderPath, findCandidateDocument, getDownloadUrl } from '@/lib/graph/drive'
import { candidateFolderName } from '@/lib/sanitize'
import { logger } from '@/lib/logger'

/**
 * Document access for the operations console.
 *
 * Gated by both the secret URL segment and a valid console session — a 404 for
 * either, so it leaks nothing. It redirects to a short-lived, pre-authenticated
 * Graph URL rather than proxying bytes (the same approach the recruiter video
 * path takes). Read-only monitoring: no upload, no delete, no SharePoint link
 * ever rendered into a page.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ gate: string; candidateId: string; kind: string }>

export async function GET(_request: Request, { params }: { params: Params }) {
  const { gate, candidateId: rawId, kind } = await params

  // Both gates, then session. Any failure is a 404 — the resource simply
  // "does not exist" to anyone who is not authenticated to the console.
  if (!monitorConfigured() || !gateMatches(gate)) return notFound()
  if (kind !== 'resume' && kind !== 'video') return notFound()
  if (!(await hasMonitorSession())) return notFound()

  try {
    const candidateId = decodeURIComponent(rawId)
    const candidate = await getCandidateByCandidateId(candidateId)
    if (!candidate) return notFound()

    const year = new Date(candidate.applicationDate).getFullYear()
    const folderPath = candidateFolderPath(
      String(year),
      candidateFolderName(candidate.candidateId, candidate.fullName),
    )
    const baseName = kind === 'resume' ? 'Resume' : 'Introduction'
    const item = await findCandidateDocument(folderPath, baseName)
    if (!item) return notFound()

    const downloadUrl = await getDownloadUrl(item.id)
    logger.info('Console document access', { operation: 'monitor_view_document', candidateId, kind })
    return NextResponse.redirect(downloadUrl)
  } catch (error) {
    logger.error('Console document access failed', error, { operation: 'monitor_view_document' })
    return notFound()
  }
}

function notFound(): NextResponse {
  return new NextResponse('Not found', { status: 404 })
}
