import 'server-only'
import { appOnlyClient, wrapGraphError } from './client'
import { sharePointEnv } from '../env'
import { AppError } from '../errors'
import { DEFAULT_POSITIONS } from '../constants'

/**
 * A caller identity for the position-scoping helpers below. Deliberately a bare
 * shape rather than importing `RecruiterIdentity` from recruiter-session, which
 * would create an import cycle (recruiter-session has no reason to depend on
 * this module, and this module must stay importable from it).
 */
export type PositionViewer = { email: string; isAdmin: boolean }

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Parses `HiringManagersJSON` tolerantly. A hand-edit in the SharePoint UI, an
 * empty column, or a legacy row with no value must never throw — it just means
 * "no managers yet" (an unmanaged position, visible only to admins).
 */
function parseManagers(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((e): e is string => typeof e === 'string').map(normaliseEmail))]
  } catch {
    return []
  }
}

/**
 * Open positions, managed by recruiters (SharePoint list `Positions`).
 *
 * The eight roles used to be hardcoded, which meant a redeploy to open a new
 * one. This mirrors the `Recruiters` list pattern instead: a recruiter adds a
 * row and the option appears everywhere — the public form, the dashboard
 * filter, and server-side validation — with no code change.
 *
 * Deactivating rather than deleting is the important part. A position that has
 * candidates against it must keep displaying on their records, so `Active = No`
 * removes it from the apply form while leaving history intact.
 */

export type PositionRecord = {
  /** SharePoint list item id — used to toggle a row, never shown to candidates. */
  itemId: string
  title: string
  active: boolean
  /**
   * The owning recruiter's email (lower-cased), or '' for a legacy/unassigned
   * row. The owner can never be removed from the hiring team and is the only
   * one (besides an admin) who may change the team's roster.
   */
  ownerEmail: string
  /**
   * Every hiring manager's email (lower-cased), including the owner. Membership
   * of this set is what gates a recruiter's access to the position's candidates.
   */
  hiringManagers: string[]
}

/** True when `viewer` may see this position's candidates: admin, or a manager. */
export function isManagerOf(record: PositionRecord, viewer: PositionViewer): boolean {
  return viewer.isAdmin || record.hiringManagers.includes(normaliseEmail(viewer.email))
}

const CACHE_TTL_MS = 60_000
let cache: { at: number; records: PositionRecord[] } | null = null

function listConfigured(): boolean {
  return !!sharePointEnv.positionsListId
}

function itemsApi(suffix = ''): string {
  return `/sites/${sharePointEnv.siteId}/lists/${sharePointEnv.positionsListId}/items${suffix}`
}

/** Tolerates `Active` as a Yes/No column or a Choice column of "Yes"/"No". */
function isActive(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return !['no', 'false', 'inactive', '0', ''].includes(value.trim().toLowerCase())
  }
  return true
}

/**
 * `Active` may be modelled as Yes/No or as a Choice of "Yes"/"No", and the two
 * accept different value shapes on write — a Choice column rejects a boolean.
 * Reading is tolerant (`isActive`), so writing has to be too: the column's real
 * type is looked up once and cached for the lifetime of the instance.
 */
let activeIsChoice: boolean | null = null

async function activeValue(active: boolean): Promise<boolean | string> {
  if (activeIsChoice === null) {
    try {
      const columns = await appOnlyClient()
        .api(`/sites/${sharePointEnv.siteId}/lists/${sharePointEnv.positionsListId}/columns`)
        .get()
      const column = (columns.value ?? []).find(
        (c: { name?: string }) => c.name === 'Active',
      ) as { choice?: unknown; boolean?: unknown } | undefined
      activeIsChoice = !!column?.choice
    } catch {
      // Unknown: assume Yes/No, which is what the setup guide specifies.
      activeIsChoice = false
    }
  }

  return activeIsChoice ? (active ? 'Yes' : 'No') : active
}

async function load(): Promise<PositionRecord[]> {
  const client = appOnlyClient()
  const records: PositionRecord[] = []

  try {
    let request = client
      .api(itemsApi())
      .expand('fields($select=Title,Active,OwnerEmail,HiringManagersJSON)')
      .top(999)

    for (;;) {
      const response = await request.get()
      for (const item of (response.value ?? []) as Array<{
        id: string
        fields?: { Title?: string; Active?: unknown; OwnerEmail?: string; HiringManagersJSON?: string }
      }>) {
        const title = item.fields?.Title?.trim()
        if (!title) continue
        const ownerEmail = normaliseEmail(item.fields?.OwnerEmail ?? '')
        const managers = parseManagers(item.fields?.HiringManagersJSON)
        // The owner is always a manager, even if the JSON column drifted out of
        // sync with the OwnerEmail column — membership checks rely on this.
        const hiringManagers = ownerEmail && !managers.includes(ownerEmail)
          ? [ownerEmail, ...managers]
          : managers
        records.push({
          itemId: item.id,
          title,
          active: isActive(item.fields?.Active),
          ownerEmail,
          hiringManagers,
        })
      }

      const next = response['@odata.nextLink'] as string | undefined
      if (!next) break
      request = client.api(next)
    }

    // Alphabetical, so the dropdown is predictable however rows were entered.
    return records.sort((a, b) => a.title.localeCompare(b.title))
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'load positions list')
  }
}

async function records(): Promise<PositionRecord[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.records
  const loaded = await load()
  cache = { at: Date.now(), records: loaded }
  return loaded
}

function invalidate(): void {
  cache = null
}

/**
 * Positions a candidate may apply for. Falls back to the built-in list when the
 * `Positions` list is not configured, so the public form never breaks on a
 * missing setup step.
 */
export async function activePositions(): Promise<string[]> {
  if (!listConfigured()) return [...DEFAULT_POSITIONS]

  try {
    const active = (await records()).filter((p) => p.active).map((p) => p.title)
    return active.length ? active : [...DEFAULT_POSITIONS]
  } catch {
    // A Graph blip must not take down the public application form.
    return [...DEFAULT_POSITIONS]
  }
}

/**
 * Every row, active or not — for the management screen.
 *
 * Deliberately bypasses the cache. The cache exists to spare the public
 * application form a Graph round-trip on every page view; the management screen
 * is low-traffic and must show the truth. Reading it through the cache meant a
 * recruiter could add a position and not see it, because `invalidate()` only
 * clears the instance that ran the write, while the re-render could be served
 * by another instance still holding a warm copy.
 *
 * The fresh read also refreshes the cache, so the public form benefits.
 */
export async function allPositions(): Promise<PositionRecord[]> {
  if (!listConfigured()) {
    return DEFAULT_POSITIONS.map((title) => ({
      itemId: '',
      title,
      active: true,
      ownerEmail: '',
      hiringManagers: [],
    }))
  }

  const loaded = await load()
  cache = { at: Date.now(), records: loaded }
  return loaded
}

export function positionsListConfigured(): boolean {
  return listConfigured()
}

export async function addPosition(title: string, ownerEmail: string): Promise<void> {
  if (!listConfigured()) {
    throw new AppError('VALIDATION_FAILED', 'Positions list is not configured', {
      publicMessage:
        'Positions are not yet configured for this site. Ask an administrator to create the Positions list.',
    })
  }

  const clean = title.trim()
  const owner = normaliseEmail(ownerEmail)
  // Fresh read: a cached list could miss a row another recruiter just added,
  // letting a duplicate through.
  const existing = await load()
  if (existing.some((p) => p.title.toLowerCase() === clean.toLowerCase())) {
    throw new AppError('VALIDATION_FAILED', `Position already exists: ${clean}`, {
      publicMessage: 'That position already exists.',
    })
  }

  try {
    // The creator becomes owner and first hiring manager — they cannot later
    // remove themselves (spec: "should not be able to remove themselves").
    await appOnlyClient()
      .api(itemsApi())
      .post({
        fields: {
          Title: clean,
          Active: await activeValue(true),
          OwnerEmail: owner,
          HiringManagersJSON: JSON.stringify(owner ? [owner] : []),
        },
      })
    invalidate()
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'add position')
  }
}

// ---------------------------------------------------------------------------
// Hiring-manager roster
//
// Writes read-modify-write the row: they re-read `HiringManagersJSON` and patch
// the whole array back, so two managers edited at once do not clobber each
// other (the same shape as `patchWithRetry` for candidate notes). Authorization
// — owner-or-admin — is enforced by the calling server action; these functions
// enforce the data invariants that must hold regardless of caller.
// ---------------------------------------------------------------------------

async function loadRow(itemId: string): Promise<PositionRecord> {
  const fresh = await load()
  const row = fresh.find((p) => p.itemId === itemId)
  if (!row) {
    throw new AppError('VALIDATION_FAILED', `Position not found: ${itemId}`, {
      publicMessage: 'That position no longer exists.',
    })
  }
  return row
}

/** Persists the manager set (owner always retained) back to the row. */
async function writeManagers(itemId: string, managers: string[]): Promise<void> {
  try {
    await appOnlyClient()
      .api(itemsApi(`/${itemId}/fields`))
      .patch({ HiringManagersJSON: JSON.stringify([...new Set(managers.map(normaliseEmail))]) })
    invalidate()
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'update hiring managers')
  }
}

export async function addHiringManager(itemId: string, email: string): Promise<void> {
  const row = await loadRow(itemId)
  const add = normaliseEmail(email)
  if (!add) throw new AppError('VALIDATION_FAILED', 'Empty manager email')
  if (row.hiringManagers.includes(add)) return
  await writeManagers(itemId, [...row.hiringManagers, add])
}

export async function removeHiringManager(itemId: string, email: string): Promise<void> {
  const row = await loadRow(itemId)
  const remove = normaliseEmail(email)
  // The owner is never removable, by anyone (spec).
  if (remove === row.ownerEmail) {
    throw new AppError('VALIDATION_FAILED', 'The owner cannot be removed from a position', {
      publicMessage: 'The owner cannot be removed from a position.',
    })
  }
  await writeManagers(itemId, row.hiringManagers.filter((m) => m !== remove))
}

/**
 * Assigns (or reassigns) a position's owner. Only used to bootstrap a legacy
 * row that predates ownership, or by an admin — enforced in the action. The new
 * owner is also added to the manager set.
 */
export async function setPositionOwner(itemId: string, email: string): Promise<void> {
  const row = await loadRow(itemId)
  const owner = normaliseEmail(email)
  if (!owner) throw new AppError('VALIDATION_FAILED', 'Empty owner email')
  const managers = row.hiringManagers.includes(owner)
    ? row.hiringManagers
    : [owner, ...row.hiringManagers]
  try {
    await appOnlyClient()
      .api(itemsApi(`/${itemId}/fields`))
      .patch({ OwnerEmail: owner, HiringManagersJSON: JSON.stringify(managers) })
    invalidate()
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'set position owner')
  }
}

// ---------------------------------------------------------------------------
// Position scoping — what a given recruiter is allowed to see
// ---------------------------------------------------------------------------

/**
 * The positions a viewer may work with:
 *   - admin           → every row (management screen shows all)
 *   - recruiter       → only rows where they are a hiring manager
 */
export async function positionsForViewer(viewer: PositionViewer): Promise<PositionRecord[]> {
  const all = await load()
  cache = { at: Date.now(), records: all }
  return viewer.isAdmin ? all : all.filter((p) => isManagerOf(p, viewer))
}

/**
 * The set of position *titles* a recruiter's candidate views must be limited
 * to. Returns `'all'` for an admin (no restriction). For a recruiter it is the
 * titles they manage — possibly empty, which means they see no candidates.
 *
 * Read through the 60s cache: this runs on every dashboard request, and the TTL
 * matches the recruiter-roster cache, so a roster change takes effect within a
 * minute either way.
 */
export async function managedTitles(viewer: PositionViewer): Promise<'all' | string[]> {
  if (viewer.isAdmin) return 'all'
  const email = normaliseEmail(viewer.email)
  return (await records()).filter((p) => p.hiringManagers.includes(email)).map((p) => p.title)
}

/** True when the caller owns this position (may edit its roster) or is admin. */
export async function canManageRoster(itemId: string, viewer: PositionViewer): Promise<boolean> {
  if (viewer.isAdmin) return true
  const row = await loadRow(itemId)
  return row.ownerEmail === normaliseEmail(viewer.email)
}

/**
 * The single gate for "may this viewer touch a candidate on this position?".
 * Throws `AUTH_DENIED` for a recruiter whose managed set excludes the title.
 * Called from the candidate detail page, the document broker, and every
 * candidate-mutating server action — a server action being a public endpoint,
 * the page-level scoping is never enough on its own (§12).
 */
export async function assertManagedPosition(
  viewer: PositionViewer,
  positionTitle: string,
): Promise<void> {
  if (viewer.isAdmin) return
  const titles = await managedTitles(viewer)
  if (titles === 'all') return
  if (!titles.includes(positionTitle)) {
    throw new AppError('AUTH_DENIED', `Recruiter ${viewer.email} not a manager of "${positionTitle}"`)
  }
}

export async function setPositionActive(itemId: string, active: boolean): Promise<void> {
  if (!listConfigured()) {
    throw new AppError('VALIDATION_FAILED', 'Positions list is not configured')
  }

  try {
    await appOnlyClient()
      .api(itemsApi(`/${itemId}/fields`))
      .patch({ Active: await activeValue(active) })
    invalidate()
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'update position')
  }
}

/**
 * Server-side check that a submitted position is one we actually offer.
 *
 * The client renders a dropdown, but the client is never the authority (§12) —
 * and since the option list is now data rather than a compile-time enum, this
 * is the only thing standing between the form and an arbitrary string.
 */
export async function isOfferedPosition(value: string): Promise<boolean> {
  const offered = await activePositions()
  return offered.some((title) => title === value)
}
