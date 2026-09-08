'use server'

import { requireRecruiter } from '@/lib/recruiter-session'
import { queryCandidates } from '@/lib/graph/candidates'
import { decodeCursor, encodeCursor } from '@/lib/cursor'
import { toView, type CandidateView } from '@/lib/candidate-view'
import { publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Fetches page N+1 of the candidate table (spec.md §3 decision 7).
 *
 * Like every server action this re-authorizes from scratch. The incoming cursor
 * is an encrypted token; `decodeCursor` both decrypts it and refuses anything
 * that is not a Graph URL we issued, so a tampered cursor cannot steer this
 * into fetching an arbitrary URL.
 */

export type LoadMoreResult =
  | { ok: true; items: CandidateView[]; nextCursor: string | null }
  | { ok: false; error: string }

export async function loadMoreCandidatesAction(
  cursorToken: string,
  query: Record<string, string>,
): Promise<LoadMoreResult> {
  try {
    await requireRecruiter()

    const nextLink = decodeCursor(cursorToken)
    if (!nextLink) {
      return { ok: false, error: 'That page link has expired. Please refresh and try again.' }
    }

    const page = await queryCandidates({ cursor: nextLink })

    return {
      ok: true,
      items: page.items.map(toView),
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    }
  } catch (error) {
    const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
    logger.error('Failed to load more candidates', appError, {
      operation: 'load_more_candidates',
      category: appError.category,
      filters: Object.keys(query),
    })
    return { ok: false, error: publicMessageFor(appError) }
  }
}
