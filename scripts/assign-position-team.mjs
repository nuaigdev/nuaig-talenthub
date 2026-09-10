/**
 * Assign a position's owner and hiring managers directly in SharePoint.
 *
 * A one-off admin helper for bootstrapping positions that predate the hiring-
 * manager feature, or for setting a team without going through the dashboard.
 * The app itself manages rosters at /recruiter/positions once an owner exists;
 * this is only for the first assignment on legacy rows.
 *
 * Writes `OwnerEmail` and `HiringManagersJSON` (a JSON array of lower-cased
 * emails, owner included) — the exact shape src/lib/graph/positions.ts reads.
 *
 *   node scripts/assign-position-team.mjs <itemId> <ownerEmail> [managerEmail ...]
 *   node scripts/assign-position-team.mjs 6 raj.vatnani@nuaig.ai mahek.jhawar@nuaig.ai
 *
 * Add --apply to actually write; without it the script only prints what it
 * would do. Reads the same MICROSOFT_* / SHAREPOINT_* variables as the app,
 * from .env.local.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const args = process.argv.slice(2).filter((a) => a !== '--apply')
const [itemId, ownerRaw, ...managerRaw] = args
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

if (!itemId || !ownerRaw) {
  console.error('Usage: node scripts/assign-position-team.mjs <itemId> <ownerEmail> [managerEmail ...] [--apply]')
  process.exit(1)
}

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(join(root, name), 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
        if (!m) continue
        const v = m[2].trim().replace(/^["']|["']$/g, '')
        if (v && !process.env[m[1]]) process.env[m[1]] = v
      }
    } catch {}
  }
}

function required(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required environment variable: ${name}`)
  return v
}

const norm = (e) => e.trim().toLowerCase()

async function token() {
  const tenant = required('MICROSOFT_TENANT_ID')
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: required('MICROSOFT_CLIENT_ID'),
      client_secret: required('MICROSOFT_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!r.ok) throw new Error(`Token request failed: ${r.status} ${await r.text()}`)
  return (await r.json()).access_token
}

async function main() {
  loadEnv()
  const owner = norm(ownerRaw)
  const managers = [...new Set([owner, ...managerRaw.map(norm)])]
  const fields = { OwnerEmail: owner, HiringManagersJSON: JSON.stringify(managers) }

  console.log(`Position item ${itemId}:`)
  console.log('  OwnerEmail          =', owner)
  console.log('  HiringManagersJSON  =', fields.HiringManagersJSON)

  if (!APPLY) {
    console.log('\nDry run — re-run with --apply to write.')
    return
  }

  const accessToken = await token()
  const site = required('SHAREPOINT_SITE_ID')
  const list = required('SHAREPOINT_POSITIONS_LIST_ID')
  const r = await fetch(`https://graph.microsoft.com/v1.0/sites/${site}/lists/${list}/items/${itemId}/fields`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!r.ok) throw new Error(`PATCH failed: ${r.status} ${await r.text()}`)
  console.log('\nWritten.')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
