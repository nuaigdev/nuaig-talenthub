import 'server-only'
import { appOnlyClient, wrapGraphError } from './client'
import { sharePointEnv } from '../env'
import { AppError } from '../errors'
import { DEFAULT_POSITIONS } from '../constants'

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

async function load(): Promise<PositionRecord[]> {
  const client = appOnlyClient()
  const records: PositionRecord[] = []

  try {
    let request = client
      .api(itemsApi())
      .expand('fields($select=Title,Active)')
      .top(999)

    for (;;) {
      const response = await request.get()
      for (const item of (response.value ?? []) as Array<{
        id: string
        fields?: { Title?: string; Active?: unknown }
      }>) {
        const title = item.fields?.Title?.trim()
        if (!title) continue
        records.push({ itemId: item.id, title, active: isActive(item.fields?.Active) })
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

/** Every row, active or not — for the management screen. */
export async function allPositions(): Promise<PositionRecord[]> {
  if (!listConfigured()) {
    return DEFAULT_POSITIONS.map((title) => ({ itemId: '', title, active: true }))
  }
  return records()
}

export function positionsListConfigured(): boolean {
  return listConfigured()
}

export async function addPosition(title: string): Promise<void> {
  if (!listConfigured()) {
    throw new AppError('VALIDATION_FAILED', 'Positions list is not configured', {
      publicMessage:
        'Positions are not yet configured for this site. Ask an administrator to create the Positions list.',
    })
  }

  const clean = title.trim()
  const existing = await records()
  if (existing.some((p) => p.title.toLowerCase() === clean.toLowerCase())) {
    throw new AppError('VALIDATION_FAILED', `Position already exists: ${clean}`, {
      publicMessage: 'That position already exists.',
    })
  }

  try {
    await appOnlyClient()
      .api(itemsApi())
      .post({ fields: { Title: clean, Active: true } })
    invalidate()
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'add position')
  }
}

export async function setPositionActive(itemId: string, active: boolean): Promise<void> {
  if (!listConfigured()) {
    throw new AppError('VALIDATION_FAILED', 'Positions list is not configured')
  }

  try {
    await appOnlyClient().api(itemsApi(`/${itemId}/fields`)).patch({ Active: active })
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
