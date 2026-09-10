import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { hasMonitorSession } from '@/lib/monitor'
import { getCandidateByCandidateId } from '@/lib/graph/candidates'
import { toView, formatDate, formatDateTime } from '@/lib/candidate-view'
import { StatusBadge } from '@/components/ui'

/**
 * Read-only candidate profile for the operations console. Everything the
 * recruiter detail page shows, minus every control that writes — this surface
 * observes, it never edits.
 */

export const dynamic = 'force-dynamic'

type Params = Promise<{ gate: string; id: string }>

export default async function ConsoleCandidatePage({ params }: { params: Params }) {
  const { gate, id } = await params
  const base = `/console/${gate}`

  if (!(await hasMonitorSession())) redirect(base)

  const record = await getCandidateByCandidateId(decodeURIComponent(id))
  if (!record) notFound()
  const c = toView(record)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <Link href={base} className="text-sm text-secondary transition-colors hover:text-brand">
        ← Back to console
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{c.fullName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secondary">
            <span className="font-medium tabular-nums text-brand">{c.candidateId}</span>
            <span aria-hidden>·</span>
            <span>{c.position}</span>
            <span aria-hidden>·</span>
            <span>Applied {formatDate(c.applicationDate)}</span>
          </p>
        </div>
        <StatusBadge status={c.status} />
      </header>

      <div className="mt-6 space-y-6">
        <Panel title="Contact & role">
          <Detail label="Email">{c.email}</Detail>
          <Detail label="Phone">{c.phone}</Detail>
          <Detail label="Location">{c.location || '—'}</Detail>
          <Detail label="Willing to relocate">{c.willingToRelocate || '—'}</Detail>
          <Detail label="LinkedIn">
            {c.linkedIn ? (
              <a href={c.linkedIn} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                View profile
              </a>
            ) : (
              '—'
            )}
          </Detail>
          <Detail label="Total experience">{c.yearsExperience} years</Detail>
          <Detail label="Relevant experience">{c.relevantExperience} years</Detail>
          <Detail label="Notice period">{c.noticePeriod}</Detail>
          <Detail label="Currently employed">{c.currentlyEmployed || '—'}</Detail>
          <Detail label="Current organisation">{c.currentCompany || '—'}</Detail>
          <Detail label="Current job title">{c.currentJobTitle || '—'}</Detail>
          <Detail label="Current CTC">{c.currentCTC || '—'}</Detail>
          <Detail label="Expected CTC">{c.expectedCTC || '—'}</Detail>
          {c.agencyCode && <Detail label="Agency code">{c.agencyCode}</Detail>}
        </Panel>

        <Panel title="Education">
          <Detail label="Highest qualification">{c.highestQualification || '—'}</Detail>
          <Detail label="Certifications">{c.certifications || '—'}</Detail>
          <Detail label="Undergraduate">{c.undergraduateCollege || '—'}</Detail>
          <Detail label="Postgraduate">{c.postgraduateCollege || '—'}</Detail>
        </Panel>

        <Panel title="Documents">
          <div className="col-span-full flex flex-wrap gap-3">
            {c.hasResume ? (
              <a
                href={`${base}/documents/${encodeURIComponent(c.candidateId)}/resume`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border-strong px-4 py-2 text-sm text-ink transition-colors hover:border-brand hover:text-brand"
              >
                View resume
              </a>
            ) : (
              <span className="text-sm text-muted">No resume</span>
            )}
            {c.hasVideo ? (
              <a
                href={`${base}/documents/${encodeURIComponent(c.candidateId)}/video`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border-strong px-4 py-2 text-sm text-ink transition-colors hover:border-brand hover:text-brand"
              >
                View intro video
              </a>
            ) : (
              <span className="text-sm text-muted">No video</span>
            )}
          </div>
        </Panel>

        <div className="rounded-lg border border-border bg-surface-raised p-5">
          <h2 className="text-sm font-semibold text-ink">Status history</h2>
          {c.statusHistory.length === 0 ? (
            <p className="mt-3 text-sm text-secondary">No changes recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {c.statusHistory.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 text-secondary">
                  <span className="text-ink">{h.toStatus}</span>
                  <span className="text-xs text-muted">
                    {h.fromStatus ? `from ${h.fromStatus} · ` : ''}
                    {formatDateTime(h.timestamp)} · {h.author}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-5">
          <h2 className="text-sm font-semibold text-ink">Recruiter notes</h2>
          {c.notes.length === 0 ? (
            <p className="mt-3 text-sm text-secondary">No notes.</p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {c.notes.map((n, i) => (
                <li key={i} className="border-l-2 border-border pl-3">
                  <p className="whitespace-pre-wrap text-ink">{n.text}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {n.author} · {formatDateTime(n.timestamp)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-5">
      <h2 className="mb-4 text-sm font-semibold text-ink">{title}</h2>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-secondary">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  )
}
