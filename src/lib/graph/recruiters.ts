import 'server-only'
import { appOnlyClient, wrapGraphError } from './client'
import { sharePointEnv } from '../env'

/**
 * Recruiter authorization (spec.md §3 decision 2).
 *
 * Entra ID SSO answers *who you are*. This list answers *whether you are
 * allowed in* — deliberately not an Entra security group, so an admin can
 * onboard or offboard a recruiter by editing a SharePoint list, with no IT
 * ticket and no redeploy.
 */

export type RecruiterRecord = {
  email: string
  displayName: string
  active: boolean
}

type ListItem = {
  id: string
  fields?: { Email?: string; DisplayName?: string; Active?: boolean }
}

/**
 * Short-lived cache. Authorization is checked on every `/recruiter` request, so
 * without this each page view costs an extra Graph round-trip. The TTL is small
 * enough that a revoked recruiter loses access within a minute.
 */
const CACHE_TTL_MS = 60_000
let cache: { at: number; byEmail: Map<string, RecruiterRecord> } | null = null

function normalise(email: string): string {
  return email.trim().toLowerCase()
}

async function loadRecruiters(): Promise<Map<string, RecruiterRecord>> {
  const client = appOnlyClient()
  const byEmail = new Map<string, RecruiterRecord>()

  try {
    let request = client
      .api(`/sites/${sharePointEnv.siteId}/lists/${sharePointEnv.recruitersListId}/items`)
      .expand('fields($select=Email,DisplayName,Active)')
      .top(999)

    // The recruiter roster is small, but page anyway rather than assume.
    for (;;) {
      const response = await request.get()
      for (const item of (response.value ?? []) as ListItem[]) {
        const email = item.fields?.Email
        if (!email) continue
        byEmail.set(normalise(email), {
          email: normalise(email),
          displayName: item.fields?.DisplayName ?? email,
          active: item.fields?.Active !== false,
        })
      }

      const next = response['@odata.nextLink'] as string | undefined
      if (!next) break
      request = client.api(next)
    }

    return byEmail
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'load recruiters list')
  }
}

async function recruiterMap(): Promise<Map<string, RecruiterRecord>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.byEmail
  const byEmail = await loadRecruiters()
  cache = { at: Date.now(), byEmail }
  return byEmail
}

/**
 * Resolves a signed-in email to an authorized recruiter, or null. A row that
 * exists with `Active = No` is treated exactly like no row at all — that is the
 * offboarding switch.
 */
export async function findActiveRecruiter(email: string): Promise<RecruiterRecord | null> {
  if (!email) return null
  const record = (await recruiterMap()).get(normalise(email))
  return record?.active ? record : null
}

/** Drops the cache — used after an authorization failure so a just-added recruiter isn't stuck waiting out the TTL. */
export function invalidateRecruiterCache(): void {
  cache = null
}
