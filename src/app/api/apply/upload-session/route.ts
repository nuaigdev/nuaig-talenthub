import { NextResponse } from 'next/server'
import { uploadSessionRequestSchema } from '@/lib/validation'
import { createUploadSession, issueDraftToken, verifyDraftToken } from '@/lib/graph/drive'
import { storageFileName } from '@/lib/sanitize'
import { uploadEnv } from '@/lib/env'
import { AppError, publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { RATE_LIMITS, clientIp, enforceRateLimit } from '@/lib/rate-limit'

/**
 * Mints a Graph upload session for one file (spec.md §3 decision 3).
 *
 * The response contains an `uploadUrl` and nothing else of value. That URL is
 * the only Graph-adjacent capability the browser is ever handed: it is
 * short-lived, scoped to a single file in a single draft folder, and cannot
 * read anything. No access token, site id, drive id or list id crosses this
 * boundary (§12).
 *
 * The bytes never pass through this function — the browser PUTs chunks straight
 * to Microsoft. That is what makes a 500MB video viable on Vercel at all.
 */

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const ip = clientIp(request)

  try {
    enforceRateLimit('upload-session', [ip], RATE_LIMITS.uploadSession)

    const parsed = uploadSessionRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'Malformed upload session request')
    }
    const { kind, contentType, size, fileName, draftToken } = parsed.data

    // Server-side type and size enforcement. The client checks these too, for a
    // fast error, but the client is never the authority (§12).
    const allowedTypes =
      kind === 'resume' ? uploadEnv.allowedResumeTypes : uploadEnv.allowedVideoTypes
    if (!allowedTypes.includes(contentType)) {
      throw new AppError('VALIDATION_FAILED', `Rejected content type "${contentType}" for ${kind}`, {
        publicMessage:
          kind === 'resume'
            ? 'Please upload your resume as a PDF, DOC or DOCX file.'
            : 'Please upload your video as an MP4 or MOV file.',
      })
    }

    const maxBytes = kind === 'resume' ? uploadEnv.maxResumeBytes : uploadEnv.maxVideoBytes
    if (size > maxBytes) {
      const limitMb = Math.round(maxBytes / (1024 * 1024))
      throw new AppError('VALIDATION_FAILED', `Rejected ${size} bytes for ${kind}`, {
        publicMessage: `That file is too large. The maximum size is ${limitMb} MB.`,
      })
    }

    // Reuse the caller's draft folder when they already have one, so the resume
    // and the video land together and a retry doesn't strand the earlier file.
    const token = draftToken ?? issueDraftToken()
    const draftId = verifyDraftToken(token)

    // Storage name is derived from the validated MIME type, never from the
    // uploaded filename (§7.1).
    const storageName = storageFileName(kind, contentType)
    const session = await createUploadSession(draftId, storageName, size)

    logger.info('Upload session created', {
      operation: 'create_upload_session',
      kind,
      size,
      contentType,
    })

    return NextResponse.json({
      uploadUrl: session.uploadUrl,
      expirationDateTime: session.expirationDateTime,
      draftToken: token,
      storageName,
      // Echoed back only so the UI can show the candidate what they picked.
      originalFileName: fileName,
    })
  } catch (error) {
    const appError = toAppError(error, 'UPLOAD_FAILED')
    logger.error('Upload session failed', appError, {
      operation: 'create_upload_session',
      category: appError.category,
      ip,
    })
    return NextResponse.json(
      { error: publicMessageFor(appError), category: appError.category },
      { status: appError.status },
    )
  }
}
