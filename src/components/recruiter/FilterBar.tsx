'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Button, Input, Select, Spinner } from '@/components/ui'
import { StatusFilter } from './StatusFilter'

/**
 * Filter bar, sitting directly under the header (spec.md §10.1) — explicitly
 * not a side panel, because the app has no sidebar anywhere.
 *
 * Every control writes to the URL and the server re-queries. Filters are part
 * of the Graph request, never applied to an already-fetched page, so paging and
 * filtering compose correctly (§3 decision 7).
 *
 * There is no search box here — the header's is the only one, and it writes the
 * same `search` param into the same URL, so the two would have been duplicates.
 */
export function FilterBar({
  basePath,
  positions,
}: {
  basePath: string
  /** Live options from the recruiter-managed Positions list. */
  positions: string[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  function apply(changes: Record<string, string | string[]>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key)
      // An array becomes repeated params (`?status=New&status=Offer`), which is
      // what `parseQuery` reads back.
      if (Array.isArray(value)) for (const entry of value) next.append(key, entry)
      else if (value) next.set(key, value)
    }
    // Any filter change invalidates the current position in the result set.
    next.delete('cursor')
    startTransition(() => router.push(`${basePath}?${next.toString()}`))
  }

  const position = params.get('position') ?? 'all'
  // Repeated params, with a comma-separated single value tolerated so a shared
  // or hand-edited URL still lights the right boxes. Mirrors `parseQuery`.
  const statuses = params
    .getAll('status')
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean)
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const sort = params.get('sort') ?? 'newest'
  const hasFilters = Boolean(
    params.get('search') || position !== 'all' || statuses.length || from || to || sort !== 'newest',
  )

  return (
    <div className="border-b border-border bg-surface">
      <div className="w-full px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="filter-position" className="mb-1 block text-xs font-medium text-secondary">
              Position
            </label>
            <Select
              id="filter-position"
              value={position}
              onChange={(event) => apply({ position: event.target.value })}
              className="w-48"
            >
              <option value="all">All positions</option>
              {positions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <StatusFilter selected={statuses} onChange={(next) => apply({ status: next })} />

          <div>
            <label htmlFor="filter-from" className="mb-1 block text-xs font-medium text-secondary">
              Applied from
            </label>
            <Input
              id="filter-from"
              type="date"
              value={from}
              onChange={(event) => apply({ from: event.target.value })}
              className="w-40"
            />
          </div>

          <div>
            <label htmlFor="filter-to" className="mb-1 block text-xs font-medium text-secondary">
              Applied to
            </label>
            <Input
              id="filter-to"
              type="date"
              value={to}
              onChange={(event) => apply({ to: event.target.value })}
              className="w-40"
            />
          </div>

          <div>
            <label htmlFor="filter-sort" className="mb-1 block text-xs font-medium text-secondary">
              Sort
            </label>
            <Select
              id="filter-sort"
              value={sort}
              onChange={(event) => apply({ sort: event.target.value })}
              className="w-44"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              {/* Pipeline order, so "early stage" runs New → Interview L1 → L2
                  → … → Joined, with Rejected and On Hold at the far end. */}
              <option value="status">Status — early stage first</option>
              <option value="status-desc">Status — late stage first</option>
            </Select>
          </div>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => startTransition(() => router.push(basePath))}
            >
              Clear
            </Button>
          )}

          {pending && <Spinner className="mb-3 text-brand" />}
        </div>
      </div>
    </div>
  )
}
