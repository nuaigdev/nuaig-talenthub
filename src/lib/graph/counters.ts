import 'server-only'
import { appOnlyClient, isPreconditionFailed, wrapGraphError } from './client'
import { sharePointEnv } from '../env'
import { AppError } from '../errors'
import { logger } from '../logger'

/**
 * Candidate ID generation — spec.md §8, decision 5.
 *
 * Uniqueness here is *guaranteed*, not probabilistic. A random suffix with an
 * existence check is explicitly rejected by the spec because it is only
 * near-zero collision risk. Instead one `CandidateCounters` list item per year
 * is incremented under Graph's optimistic concurrency: read the item with its
 * ETag, PATCH with `If-Match`, and on 412 (someone else incremented between our
 * read and write) re-read and retry. Whoever wins the race gets that number and
 * nobody can get it twice.
 */

const MAX_ATTEMPTS = 5

/** Backoff between contention retries, with jitter so retries don't re-collide. */
function backoffMs(attempt: number): number {
  return 40 * 2 ** attempt + Math.floor(Math.random() * 40)
}

type CounterItem = {
  id: string
  '@odata.etag': string
  fields: { id: string; Title: string; CurrentValue?: number }
}

function countersItemsApi(): string {
  return `/sites/${sharePointEnv.siteId}/lists/${sharePointEnv.countersListId}/items`
}

async function findCounter(year: string): Promise<CounterItem | null> {
  const client = appOnlyClient()
  try {
    const response = await client
      .api(countersItemsApi())
      .expand('fields($select=id,Title,CurrentValue)')
      .filter(`fields/Title eq '${year}'`)
      .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
      .top(1)
      .get()

    const [item] = (response.value ?? []) as CounterItem[]
    return item ?? null
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'counter lookup')
  }
}

async function createCounter(year: string): Promise<CounterItem> {
  const client = appOnlyClient()
  try {
    // Created at 0; the caller's PATCH performs the first increment to 1.
    return (await client
      .api(countersItemsApi())
      .post({ fields: { Title: year, CurrentValue: 0 } })) as CounterItem
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'counter create')
  }
}

/**
 * Reserves the next sequence number for `year` and returns the formatted ID,
 * e.g. `NUAIG-2026-00001`.
 */
export async function nextCandidateId(now: Date = new Date()): Promise<string> {
  const year = String(now.getFullYear())
  const client = appOnlyClient()

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let counter = await findCounter(year)

    if (!counter) {
      try {
        counter = await createCounter(year)
      } catch (error) {
        // A concurrent submission may have created the year's item first; that
        // is a normal race, so fall through and re-read on the next attempt.
        logger.warn('Counter create raced, retrying', {
          operation: 'next_candidate_id',
          year,
          attempt,
        })
        continue
      }
    }

    const current = Number(counter.fields.CurrentValue ?? 0)
    const next = current + 1

    try {
      await client
        .api(`${countersItemsApi()}/${counter.id}/fields`)
        .header('If-Match', counter['@odata.etag'])
        .patch({ CurrentValue: next })

      return `NUAIG-${year}-${String(next).padStart(5, '0')}`
    } catch (error) {
      if (!isPreconditionFailed(error)) {
        throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'counter increment')
      }

      // 412: another submission took `next` first. Re-read and try again.
      logger.warn('Counter contention, retrying', {
        operation: 'next_candidate_id',
        year,
        attempt,
        attemptedValue: next,
      })
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)))
    }
  }

  throw new AppError(
    'GRAPH_UNAVAILABLE',
    `Candidate ID contention not resolved after ${MAX_ATTEMPTS} attempts for year ${year}`,
    { context: { year } },
  )
}
