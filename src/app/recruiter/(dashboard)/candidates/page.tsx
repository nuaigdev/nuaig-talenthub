import type { Metadata } from 'next'
import { requireRecruiter } from '@/lib/recruiter-session'
import { queryCandidates } from '@/lib/graph/candidates'
import { parseQuery, serialiseQuery } from '@/lib/candidate-query'
import { encodeCursor } from '@/lib/cursor'
import { toView } from '@/lib/candidate-view'
import { Alert } from '@/components/ui'
import { FilterBar } from '@/components/recruiter/FilterBar'
import { CandidateTable } from '@/components/recruiter/CandidateTable'
import { logger } from '@/lib/logger'
import { publicMessageFor, toAppError } from '@/lib/errors'

/**
 * The Candidates view (spec.md §6.2) — the same server-paginated table without
 * the summary tiles, for recruiters working through the list rather than
 * scanning the pipeline.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Candidates' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function CandidatesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRecruiter()

  const query = parseQuery(await searchParams)

  try {
    const page = await queryCandidates(query)

    return (
      <>
        <FilterBar basePath="/recruiter/candidates" />

        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">Candidates</h1>
            <p className="mt-0.5 text-sm text-secondary">
              Search and filter the full applicant list.
            </p>
          </div>

          <CandidateTable
            initialItems={page.items.map(toView)}
            initialCursor={page.nextCursor ? encodeCursor(page.nextCursor) : null}
            query={serialiseQuery(query)}
          />
        </div>
      </>
    )
  } catch (error) {
    const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
    logger.error('Candidates list load failed', appError, {
      operation: 'load_candidates',
      category: appError.category,
    })

    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Alert tone="error" title="Could not load candidates">
          {publicMessageFor(appError)}
        </Alert>
      </div>
    )
  }
}
