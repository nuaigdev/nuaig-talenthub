/**
 * One-off backfill for the `StatusRank` column (SHAREPOINT_SETUP.md §3).
 *
 * The dashboard's status sort orders by `StatusRank`, a number the app writes
 * alongside `Status` on every create and status change. Rows that existed
 * before the column did have no value, and would otherwise collect at one end
 * of that sort. This walks the list once and fills them in.
 *
 * Deliberately standalone: it talks to Graph over plain fetch and imports
 * nothing from `src/`, so it needs no Next runtime, no bundler and no module
 * resolution tricks. The cost is the small rank table below, duplicated from
 * `statusRank` in src/lib/constants.ts — which is the source of truth. This is
 * a one-shot migration, so the copy going stale afterwards is harmless.
 *
 *   node scripts/backfill-status-rank.mjs           # report only, writes nothing
 *   node scripts/backfill-status-rank.mjs --apply   # actually patch the rows
 *
 * Reads the same MICROSOFT_* and SHAREPOINT_* variables the app does, from
 * .env.local. Safe to re-run: rows that already carry the right rank are
 * skipped.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// --- config -----------------------------------------------------------------

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(join(root, name), 'utf8').split(/\r?\n/)) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
        if (!match) continue
        const value = match[2].trim().replace(/^["']|["']$/g, '')
        if (value && !process.env[match[1]]) process.env[match[1]] = value
      }
    } catch {
      // Missing file is fine — the values may come from the real environment.
    }
  }
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

// --- rank (mirror of statusRank in src/lib/constants.ts) --------------------

const STAGES = [
  'New',
  'Screening',
  'Shortlisted',
  'Interview',
  'Selected',
  'Offer',
  'Joined',
  'Rejected',
  'On Hold',
]
const LEVELS = ['L1', 'L2', 'L3']
const LEVELLED = new Set(['Interview', 'Selected', 'Rejected'])

function statusRank(value) {
  const trimmed = (value ?? '').trim()
  for (const stage of STAGES) {
    if (trimmed === stage) return (STAGES.indexOf(stage) + 1) * 10
    if (LEVELLED.has(stage) && trimmed.startsWith(`${stage} `)) {
      const suffix = trimmed.slice(stage.length + 1).trim()
      if (LEVELS.includes(suffix)) {
        return (STAGES.indexOf(stage) + 1) * 10 + LEVELS.indexOf(suffix) + 1
      }
    }
  }
  // Same fallback as parseStatus: an unrecognised value reads as New.
  return 10
}

// --- graph ------------------------------------------------------------------

async function token() {
  const tenant = required('MICROSOFT_TENANT_ID')
  const response = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: required('MICROSOFT_CLIENT_ID'),
        client_secret: required('MICROSOFT_CLIENT_SECRET'),
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  )
  if (!response.ok) throw new Error(`Token request failed: ${response.status} ${await response.text()}`)
  return (await response.json()).access_token
}

async function graph(accessToken, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${url} -> ${response.status} ${await response.text()}`)
  }
  return response.status === 204 ? null : response.json()
}

// --- run --------------------------------------------------------------------

async function main() {
  loadEnv()

  const accessToken = await token()
  const site = required('SHAREPOINT_SITE_ID')
  const list = required('SHAREPOINT_CANDIDATES_LIST_ID')
  const itemsUrl = `https://graph.microsoft.com/v1.0/sites/${site}/lists/${list}/items`

  let next = `${itemsUrl}?$expand=fields($select=CandidateID,Status,StatusRank)&$top=200`
  let seen = 0
  let changed = 0
  const failures = []

  while (next) {
    const page = await graph(accessToken, next)

    for (const item of page.value ?? []) {
      seen += 1
      const fields = item.fields ?? {}
      const want = statusRank(fields.Status ?? 'New')
      if (fields.StatusRank === want) continue

      changed += 1
      const label = `${fields.CandidateID ?? item.id}  ${String(fields.Status ?? '').padEnd(14)} ${fields.StatusRank ?? '(empty)'} -> ${want}`

      if (!APPLY) {
        console.log('  would set', label)
        continue
      }

      try {
        await graph(accessToken, `${itemsUrl}/${item.id}/fields`, {
          method: 'PATCH',
          body: JSON.stringify({ StatusRank: want }),
        })
        console.log('  set      ', label)
      } catch (error) {
        failures.push(`${fields.CandidateID ?? item.id}: ${error.message}`)
      }
    }

    next = page['@odata.nextLink'] ?? null
  }

  console.log(
    `\n${seen} row(s) scanned, ${changed} needing a rank` +
      (APPLY ? `, ${changed - failures.length} written` : ' (dry run — re-run with --apply)'),
  )

  if (failures.length) {
    console.error(`\n${failures.length} row(s) failed:`)
    for (const failure of failures) console.error('  ', failure)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
