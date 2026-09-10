import { NextResponse } from 'next/server'
import { requireRecruiter } from '@/lib/recruiter-session'
import { getCandidateByCandidateId } from '@/lib/graph/candidates'
import { assertManagedPosition } from '@/lib/graph/positions'
import { candidateFolderPath, findCandidateDocument, getDownloadUrl } from '@/lib/graph/drive'
import { candidateFolderName } from '@/lib/sanitize'
import { AppError, publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Brokers access to a candidate's resume or intro video (spec.md §10.2, §12).
 *
 * Recruiters never receive a SharePoint URL. This handler re-authorizes, locates
 * the file with app-only credentials, and serves it so the dashboard can display
 * it inline — never as a download, and never in another tab.
 *
 * The two file kinds are served differently, and deliberately:
 *
 *   resume  — proxied through this function with `Content-Disposition: inline`.
 *             Graph's pre-authenticated URL sets `attachment`, which makes a
 *             browser download the file instead of rendering it, so an <iframe>
 *             pointed at it would defeat the whole purpose. Resumes are capped
 *             at 10MB, so proxying one is cheap.
 *
 *   video   — never proxied. `?as=url` hands the player the short-lived Graph
 *             URL so bytes stream straight from Microsoft with native range
 *             requests and seeking. Pushing 500MB through a serverless function
 *             is exactly what §3 decision 3 rules out, and that reasoning does
 *             not stop applying on the way back out.
 *
 * The folder is resolved from the candidate's own record, never from anything in
 * the request, so this cannot be steered at an arbitrary path.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = Promise<{ candidateId: string; kind: string }>

export async function GET(request: Request, { params }: { params: Params }) {
  const { candidateId: rawId, kind } = await params
  const candidateId = decodeURIComponent(rawId)
  const asUrl = new URL(request.url).searchParams.get('as') === 'url'

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

    // A recruiter may only fetch documents for candidates on a position they
    // manage. Checked here, not just on the page, because this is a directly
    // reachable endpoint (§12). Admins are unrestricted.
    await assertManagedPosition(
      { email: recruiter.email, isAdmin: recruiter.isAdmin },
      candidate.position,
    )

    // Folder name is regenerated from stored data with the same sanitiser used
    // at write time, so it round-trips exactly (spec.md §7.1).
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

    // The video player asks for the URL itself, so seeking talks to Microsoft
    // directly instead of re-entering this function on every scrub.
    if (asUrl) {
      return NextResponse.json(
        {
          url: downloadUrl,
          fileName: item.name,
          contentType: item.file?.mimeType ?? 'application/octet-stream',
        },
        { headers: { 'Cache-Control': 'no-store, private' } },
      )
    }

    if (kind === 'video') {
      // Direct <video src> fallback: redirect rather than carry the bytes.
      return NextResponse.redirect(downloadUrl, {
        status: 302,
        headers: { 'Cache-Control': 'no-store, private' },
      })
    }

    // Resume: stream the bytes through with an inline disposition so the
    // browser renders it in place.
    const upstream = await fetch(downloadUrl, { cache: 'no-store' })
    if (!upstream.ok || !upstream.body) {
      throw new AppError('GRAPH_UNAVAILABLE', `Resume fetch failed: ${upstream.status}`, {
        context: { itemId: item.id },
      })
    }

    const contentType = item.file?.mimeType ?? 'application/pdf'
    const headers = new Headers({
      'Content-Type': contentType,
      // The filename is the normalised storage name, which carries no candidate
      // data beyond what the recruiter is already looking at.
      'Content-Disposition': `inline; filename="${item.name}"`,
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    })
    const length = upstream.headers.get('content-length')
    if (length) headers.set('Content-Length', length)

    return new NextResponse(upstream.body, { status: 200, headers })
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
