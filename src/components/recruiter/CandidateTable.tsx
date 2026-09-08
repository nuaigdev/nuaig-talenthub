'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, Card, Spinner, StatusBadge } from '@/components/ui'
import { formatDate, type CandidateView } from '@/lib/candidate-view'
import { loadMoreCandidatesAction } from '@/app/recruiter/load-more'

/**
 * The candidate table (spec.md §10.1).
 *
 * The first page is server-rendered; "Load more" calls a server action that
 * returns the next page and appends it. Paging is cursor-based against Graph,
 * so the client never holds the full result set and the cursor stays opaque.
 */
export function CandidateTable({
  initialItems,
  initialCursor,
  query,
}: {
  initialItems: CandidateView[]
  initialCursor: string | null
  /** The serialised filter state, replayed for each subsequent page. */
  query: Record<string, string>
}) {
  const [items, setItems] = useState(initialItems)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A filter change re-renders the server component with fresh props; reset the
  // accumulated pages so stale rows from the previous filter don't linger.
  useEffect(() => {
    setItems(initialItems)
    setCursor(initialCursor)
    setError(null)
  }, [initialItems, initialCursor])

  async function loadMore() {
    if (!cursor) return
    setLoading(true)
    setError(null)

    const result = await loadMoreCandidatesAction(cursor, query)
    if (result.ok) {
      setItems((current) => [...current, ...result.items])
      setCursor(result.nextCursor)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  if (!items.length) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-medium text-ink">No candidates match these filters.</p>
        <p className="mt-1 text-sm text-secondary">
          Try clearing the search or widening the date range.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {/* Wide table scrolls inside its own container so the page never
            scrolls horizontally on a narrow screen. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] border-collapse text-sm">
            <caption className="sr-only">Candidates matching the current filters</caption>
            <thead>
              <tr className="border-b border-border bg-surface text-left">
                <Th>Candidate ID</Th>
                <Th>Name</Th>
                <Th>Position</Th>
                <Th align="right">Experience</Th>
                <Th>Expected CTC</Th>
                <Th>Notice</Th>
                <Th>Applied</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((candidate) => (
                <tr
                  key={candidate.candidateId}
                  className="border-b border-border last:border-0 transition-colors hover:bg-brand-subtle/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/recruiter/candidates/${candidate.candidateId}`}
                      className="rounded font-medium tabular-nums text-brand hover:underline"
                    >
                      {candidate.candidateId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{candidate.fullName}</div>
                    <div className="text-xs text-secondary">{candidate.location}</div>
                  </td>
                  <td className="px-4 py-3 text-ink">{candidate.position}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {candidate.yearsExperience} yrs
                  </td>
                  <td className="px-4 py-3 text-secondary">{candidate.expectedCTC || '—'}</td>
                  <td className="px-4 py-3 text-secondary">{candidate.noticePeriod}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-secondary">
                    {formatDate(candidate.applicationDate)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={candidate.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-center gap-4">
        <p aria-live="polite" className="text-xs text-secondary">
          Showing {items.length} candidate{items.length === 1 ? '' : 's'}
          {cursor ? '' : ' — end of results'}
        </p>
        {cursor && (
          <Button type="button" variant="secondary" size="sm" onClick={() => void loadMore()} disabled={loading}>
            {loading && <Spinner />}
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-[#DC2626]">
          {error}
        </p>
      )}
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-secondary ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  )
}
