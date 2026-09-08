import type { CandidateQuery } from './graph/candidates'
import { isStatus } from './constants'

/**
 * Translation between URL search params and a typed Graph query.
 *
 * Everything here is a whitelist: an unrecognised position, status or sort
 * falls back to a safe default rather than reaching the OData filter builder.
 * Free-text search is the one pass-through value, and it is escaped downstream
 * in `graph/candidates.ts`.
 */

export function parseQuery(params: Record<string, string | string[] | undefined>): CandidateQuery {
  const one = (key: string): string | undefined => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const position = one('position')
  const status = one('status')
  const sort = one('sort')

  return {
    search: one('search') || undefined,
    // Positions are recruiter-managed data now, so this cannot be checked
    // against a fixed list. The value is escaped before it reaches the OData
    // filter (`odata()` in graph/candidates.ts); an unknown one simply matches
    // nothing, which is the correct outcome for a stale bookmark.
    position: position ? position.slice(0, 150) : 'all',
    status: status && isStatus(status) ? status : 'all',
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
  if (query.status && query.status !== 'all') out.status = query.status
  if (query.from) out.from = query.from
  if (query.to) out.to = query.to
  if (query.sort) out.sort = query.sort
  return out
}

function isDate(value: string | undefined): boolean {
  if (!value) return false
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime())
}
