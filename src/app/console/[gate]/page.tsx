import Link from 'next/link'
import { hasMonitorSession } from '@/lib/monitor'
import { ConsoleLogin } from '@/components/monitor/ConsoleLogin'
import { signOutMonitor } from './actions'
import { countByStatus, queryCandidates } from '@/lib/graph/candidates'
import { positionsForViewer } from '@/lib/graph/positions'
import { parseQuery } from '@/lib/candidate-query'
import { toView, formatDate } from '@/lib/candidate-view'
import { STATUS_COLORS, SUMMARY_STAGES } from '@/lib/constants'
import { StatusBadge } from '@/components/ui'

/**
 * The operations console. Read-only, admin-scope: it reuses the same data
 * functions as the recruiter dashboard with no position restriction, but offers
 * no way to write — no notes, no status changes, no edits. A monitoring glance,
 * nothing more.
 */

export const dynamic = 'force-dynamic'

type Params = Promise<{ gate: string }>
type Search = Promise<Record<string, string | string[] | undefined>>

export default async function ConsolePage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Search
}) {
  const { gate } = await params
  const base = `/console/${gate}`

  // The layout already validated the gate. If there is no session, show login.
  if (!(await hasMonitorSession())) {
    return <ConsoleLogin gate={gate} />
  }

  const query = parseQuery(await searchParams)
  const [summary, page, positions] = await Promise.all([
    countByStatus(),
    queryCandidates({ ...query, pageSize: 100 }),
    positionsForViewer({ email: '', isAdmin: true }),
  ])
  const rows = page.items.map(toView)
  const signOut = signOutMonitor.bind(null, gate)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt="NuAIg" width={78} height={32} style={{ height: 32, width: 'auto' }} />
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium text-white">
            Operations · read-only
          </span>
        </div>
        <form action={signOut}>
          <button type="submit" className="rounded-md text-sm text-secondary transition-colors hover:text-brand">
            Sign out
          </button>
        </form>
      </header>

      {/* Stat strip across every position. */}
      <section aria-label="Pipeline summary" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Total" value={summary.total} accent="var(--color-ink)" />
        {SUMMARY_STAGES.map((stage) => (
          <Stat key={stage} label={stage} value={summary.counts[stage] ?? 0} accent={STATUS_COLORS[stage]} />
        ))}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
        {/* Candidate table */}
        <section aria-label="Candidates" className="min-w-0 order-2 lg:order-1">
          <form method="get" className="mb-3 flex flex-wrap gap-2">
            <input
              type="search"
              name="q"
              defaultValue={query.search ?? ''}
              placeholder="Search name, ID or email"
              className="h-9 min-w-[14rem] flex-1 rounded-md border border-border bg-white px-3 text-sm"
            />
            <select name="position" defaultValue={query.position ?? 'all'} className="h-9 rounded-md border border-border bg-white px-2 text-sm">
              <option value="all">All positions</option>
              {positions.map((p) => (
                <option key={p.itemId || p.title} value={p.title}>
                  {p.title}
                </option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover">
              Filter
            </button>
          </form>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-secondary">
                  <th className="px-4 py-2.5 font-medium">Candidate</th>
                  <th className="px-4 py-2.5 font-medium">Position</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Applied</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-secondary">
                      No candidates match.
                    </td>
                  </tr>
                ) : (
                  rows.map((c) => (
                    <tr key={c.candidateId} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-2.5">
                        <Link href={`${base}/c/${encodeURIComponent(c.candidateId)}`} className="font-medium text-ink hover:text-brand">
                          {c.fullName}
                        </Link>
                        <span className="block text-xs tabular-nums text-muted">{c.candidateId}</span>
                      </td>
                      <td className="px-4 py-2.5 text-secondary">{c.position}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-secondary">{formatDate(c.applicationDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {page.nextCursor && (
            <p className="mt-2 text-xs text-muted">Showing the most recent 100. Narrow with search or a position filter to see the rest.</p>
          )}
        </section>

        {/* Positions overview */}
        <aside aria-label="Positions" className="order-1 lg:order-2">
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <h2 className="text-sm font-semibold text-ink">Positions</h2>
            <ul className="mt-3 space-y-3">
              {positions.map((p) => {
                const managers = p.hiringManagers.filter((m) => m !== p.ownerEmail)
                return (
                  <li key={p.itemId || p.title} className="text-sm">
                    <p className="flex items-center gap-2 font-medium text-ink">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: p.active ? '#16A34A' : '#9CA3AF' }}
                        aria-hidden
                      />
                      {p.title}
                    </p>
                    <p className="mt-0.5 text-xs text-secondary">
                      Owner: {p.ownerEmail || '—'}
                      {managers.length > 0 && <> · Team: {managers.join(', ')}</>}
                    </p>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
        <span className="truncate text-xs text-secondary">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}
