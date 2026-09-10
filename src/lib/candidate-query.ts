import type { CandidateQuery } from './graph/candidates'
import { STATUS_STAGES, isStatusFilter } from './constants'

/**
 * Translation between URL search params and a typed Graph query.
 *
 * Everything here is a whitelist: an unrecognised position, status or sort
 * falls back to a safe default rather than reaching the OData filter builder.
 * Free-text search is the one pass-through value, and it is escaped downstream
 * in `graph/candidates.ts`.
 *
 * `status` is repeatable — `?status=New&status=Interview` — so the filter bar
 * can select several at once. A comma-separated single value is accepted too,
 * because that is what a hand-edited or shared URL tends to look like.
 */

export function parseQuery(params: Record<string, string | string[] | undefined>): CandidateQuery {
  const one = (key: string): string | undefined => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const all = (key: string): string[] => {
    const value = params[key]
    const raw = Array.isArray(value) ? value : value ? [value] : []
    return raw.flatMap((entry) => entry.split(',')).map((entry) => entry.trim())
  }

  const position = one('position')
  const sort = one('sort')

  // Deduped and capped: the list is a whitelist, but the clauses are OR-ed into
  // one OData filter and there is no reason to let a crafted URL repeat them.
  const statuses = [...new Set(all('status').filter(isStatusFilter))].slice(0, STATUS_STAGES.length)

  return {
    search: one('search') || undefined,
    // Positions are recruiter-managed data now, so this cannot be checked
    // against a fixed list. The value is escaped before it reaches the OData
    // filter (`odata()` in graph/candidates.ts); an unknown one simply matches
    // nothing, which is the correct outcome for a stale bookmark.
    position: position ? position.slice(0, 150) : 'all',
    statuses,
    from: isDate(one('from')) ? one('from') : undefined,
    to: isDate(one('to')) ? one('to') : undefined,
    sort: sort === 'oldest' || sort === 'experience' ? sort : 'newest',
  }
}

/** The filter state the client replays when asking for the next page. */
export function serialiseQuery(query: CandidateQuery): Record<string, string> {
  const out: Record<string, string> = {}
  if (query.search) out.search = query.search
  if (query.position && query.position !== 'all') out.position = query.position
  if (query.statuses?.length) out.status = query.statuses.join(',')
  if (query.from) out.from = query.from
  if (query.to) out.to = query.to
  if (query.sort) out.sort = query.sort
  return out
}

function isDate(value: string | undefined): boolean {
  if (!value) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime())
}
