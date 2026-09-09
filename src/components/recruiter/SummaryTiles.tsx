import Link from 'next/link'
import { STATUS_COLORS, SUMMARY_STAGES } from '@/lib/constants'

/**
 * Dashboard summary tiles (spec.md §10.1).
 *
 * Each tile links into the table pre-filtered to that stage, so the number is a
 * way in rather than just a readout. A stage tile counts every round within it —
 * "Interview" is L1 plus L2 plus L3, which is what a recruiter scanning the
 * pipeline actually wants to know.
 */
export function SummaryTiles({
  counts,
  total,
  truncated,
}: {
  counts: Record<string, number>
  total: number
  truncated: boolean
}) {
  return (
    <section aria-label="Candidate summary" className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Tile label="Total" value={total} href="/recruiter" accent="var(--color-ink)" />
        {SUMMARY_STAGES.map((status) => (
          <Tile
            key={status}
            label={status}
            value={counts[status] ?? 0}
            href={`/recruiter?status=${encodeURIComponent(status)}`}
            accent={STATUS_COLORS[status]}
          />
        ))}
      </div>

      {truncated && (
        <p className="text-xs text-muted">
          Totals reflect the most recent records only; the table below is complete.
        </p>
      )}
    </section>
  )
}

function Tile({
  label,
  value,
  href,
  accent,
}: {
  label: string
  value: number
  href: string
  accent: string
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-surface-raised p-4 shadow-sm transition-colors hover:border-border-strong"
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
          aria-hidden="true"
        />
        {label}
      </span>
      <span className="mt-1.5 block text-2xl font-semibold tabular-nums text-ink">{value}</span>
    </Link>
  )
}
