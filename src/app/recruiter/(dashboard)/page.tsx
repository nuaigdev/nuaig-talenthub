import type { Metadata } from 'next'
import { requireRecruiter } from '@/lib/recruiter-session'
import { countByStatus, queryCandidates } from '@/lib/graph/candidates'
import { parseQuery, serialiseQuery } from '@/lib/candidate-query'
import { activePositions } from '@/lib/graph/positions'
import { encodeCursor } from '@/lib/cursor'
import { toView } from '@/lib/candidate-view'
import { Alert } from '@/components/ui'
import { FilterBar } from '@/components/recruiter/FilterBar'
import { CandidateTable } from '@/components/recruiter/CandidateTable'
import { SummaryTiles } from '@/components/recruiter/SummaryTiles'
import { logger } from '@/lib/logger'
import { publicMessageFor, toAppError } from '@/lib/errors'

/**
 * Dashboard home (spec.md §10.1): summary tiles, filter bar, candidate table.
 *
 * Always dynamic — this reads live SharePoint state per recruiter and must
 * never be served from a build-time or shared cache.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Dashboard' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRecruiter()

  const query = parseQuery(await searchParams)

  try {
    // Independent reads, so they go out together.
    const [summary, page, positions] = await Promise.all([
      countByStatus(),
      queryCandidates(query),
      activePositions(),
    ])

    return (
      <>
        <FilterBar basePath="/recruiter" positions={positions} />

        <div className="w-full space-y-6 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
            <p className="mt-0.5 text-sm text-secondary">
              Every application, with filters applied server-side.
            </p>
          </div>

          <SummaryTiles
            counts={summary.counts}
            total={summary.total}
            truncated={summary.truncated}
          />

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
    logger.error('Dashboard load failed', appError, {
      operation: 'load_dashboard',
      category: appError.category,
    })

    return (
      <div className="w-full max-w-3xl px-4 py-12 sm:px-6">
        <Alert tone="error" title="Could not load candidates">
          {publicMessageFor(appError)}
        </Alert>
      </div>
    )
  }
}
