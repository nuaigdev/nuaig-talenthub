import 'server-only'
import { appOnlyClient, wrapGraphError } from './client'
import { sharePointEnv } from '../env'
import { parseRole, type RecruiterRole } from '../constants'

/**
 * Recruiter authorization (spec.md §3 decision 2).
 *
 * Entra ID SSO answers *who you are*. This list answers *whether you are
 * allowed in* — deliberately not an Entra security group, so an admin can
 * onboard or offboard a recruiter by editing a SharePoint list, with no IT
 * ticket and no redeploy.
 *
 * The `Role` column layers coarse RBAC on top: an `admin` sees every position
 * and candidate, a `recruiter` only the positions they are a hiring manager on
 * (enforced in positions.ts / candidates.ts). Role is read tolerantly and
 * fails safe to `recruiter`.
 */

export type RecruiterRecord = {
  email: string
  displayName: string
  active: boolean
  role: RecruiterRole
}

type ListItem = {
  id: string
  fields?: { Email?: string; DisplayName?: string; Active?: boolean | string; Role?: string }
}

/**
 * Reads the `Active` flag tolerantly.
 *
 * A Yes/No column arrives as a boolean, but the same column modelled as a
 * Choice arrives as the string "Yes"/"No" — and a naive `!== false` check would
 * read "No" as active, silently defeating the offboarding switch. Anything not
 * recognised as a negative is treated as active, so a missing column fails open
 * for the roster rather than locking every recruiter out.
 */
function isActive(value: boolean | string | undefined): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return !['no', 'false', 'inactive', '0', ''].includes(value.trim().toLowerCase())
  }
  return true
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
      .expand('fields($select=Email,DisplayName,Active,Role)')
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
          active: isActive(item.fields?.Active),
          role: parseRole(item.fields?.Role),
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

/**
 * Every active recruiter, for the "add a hiring manager" dropdown on the
 * Positions screen. A position's hiring managers must come from this roster
 * (spec: "other users should only come from recruiters list"), so the picker
 * and the server-side validation both read it. Sorted by display name for a
 * predictable list.
 */
export async function listActiveRecruiters(): Promise<RecruiterRecord[]> {
  const all = [...(await recruiterMap()).values()].filter((r) => r.active)
  return all.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/** True when `email` is on the roster and active — used to validate a manager add. */
export async function isActiveRecruiter(email: string): Promise<boolean> {
  return (await findActiveRecruiter(email)) !== null
}
