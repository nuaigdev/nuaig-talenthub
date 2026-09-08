import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRecruiter } from '@/lib/recruiter-session'
import { getCandidateByCandidateId } from '@/lib/graph/candidates'
import { formatDate, toView } from '@/lib/candidate-view'
import { Card, StatusBadge } from '@/components/ui'
import { StatusControl } from '@/components/recruiter/StatusControl'
import { NotesPanel } from '@/components/recruiter/NotesPanel'
import { DocumentViewer } from '@/components/recruiter/DocumentViewer'

/**
 * Candidate detail (spec.md §10.2).
 *
 * Documents open in a modal on this page — never downloaded, never a new tab —
 * served by `/api/recruiter/documents/…`, which re-authorizes on every request.
 * No SharePoint link ever reaches this page's HTML.
 */

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  return { title: id }
}

export default async function CandidateDetailPage({ params }: { params: Params }) {
  await requireRecruiter()

  const { id } = await params
  const record = await getCandidateByCandidateId(decodeURIComponent(id))
  if (!record) notFound()

  const candidate = toView(record)

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <Link
        href="/recruiter"
        className="rounded text-sm text-secondary transition-colors hover:text-brand"
      >
        ← Back to dashboard
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{candidate.fullName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secondary">
            <span className="font-medium tabular-nums text-brand">{candidate.candidateId}</span>
            <span aria-hidden="true">·</span>
            <span>{candidate.position}</span>
            <span aria-hidden="true">·</span>
            <span>Applied {formatDate(candidate.applicationDate)}</span>
          </p>
        </div>
        <StatusBadge status={candidate.status} />
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold text-ink">Contact &amp; role details</h2>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Email">
                <a href={`mailto:${candidate.email}`} className="rounded text-brand hover:underline">
                  {candidate.email}
                </a>
              </Detail>
              <Detail label="Phone">
                <a href={`tel:${candidate.phone}`} className="rounded text-brand hover:underline">
                  {candidate.phone}
                </a>
              </Detail>
              <Detail label="Location">{candidate.location}</Detail>
              <Detail label="LinkedIn">
                {candidate.linkedIn ? (
                  <a
                    href={candidate.linkedIn}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded text-brand hover:underline"
                  >
                    View profile
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="Experience">{candidate.yearsExperience} years</Detail>
              <Detail label="Notice period">{candidate.noticePeriod}</Detail>
              <Detail label="Current CTC">{candidate.currentCTC || '—'}</Detail>
              <Detail label="Expected CTC">{candidate.expectedCTC || '—'}</Detail>
            </dl>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-sm font-semibold text-ink">Documents</h2>
            <DocumentViewer
              candidateId={candidate.candidateId}
              candidateName={candidate.fullName}
              hasResume={candidate.hasResume}
              hasVideo={candidate.hasVideo}
              resumeExt={candidate.resumeExt}
            />
          </Card>

          <Card className="p-5 sm:p-6">
            <NotesPanel candidateId={candidate.candidateId} notes={candidate.notes} />
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="p-5 sm:p-6">
            <StatusControl
              candidateId={candidate.candidateId}
              status={candidate.status}
              history={candidate.statusHistory}
            />
          </Card>
        </div>
      </div>
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
