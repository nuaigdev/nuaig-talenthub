'use client'

import { useState, useTransition } from 'react'
import { Alert, Select, Spinner, StatusBadge } from '@/components/ui'
import {
  STATUS_LEVELS,
  STATUS_STAGES,
  formatStatus,
  parseStatus,
  stageTakesLevel,
  type CandidateStatus,
} from '@/lib/constants'
import { formatDateTime } from '@/lib/candidate-view'
import type { StatusHistoryEntry } from '@/lib/graph/candidates'
import { changeStatusAction } from '@/app/recruiter/actions'

/**
 * Status dropdown plus the full change history (spec.md §10.2, §3 decision 9).
 *
 * The history below the dropdown is the point: every change is appended, so a
 * simultaneous edit by another recruiter is visible rather than silently lost.
 * The dropdown shows the latest entry as current.
 */
export function StatusControl({
  candidateId,
  status,
  history,
}: {
  candidateId: string
  status: CandidateStatus
  history: StatusHistoryEntry[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState(status)

  const current = parseStatus(optimistic)

  function onChange(next: string) {
    const value = next as CandidateStatus
    setOptimistic(value)
    setError(null)

    const formData = new FormData()
    formData.set('status', value)

    startTransition(async () => {
      const result = await changeStatusAction(candidateId, formData)
      if (!result.ok) {
        setError(result.error)
        setOptimistic(status) // Roll back the control to the server's truth.
      }
    })
  }

  // Newest first for reading; the stored log itself stays chronological.
  const entries = [...history].reverse()

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Status</h2>
        {pending && <Spinner className="text-brand" />}
      </div>

      {/* Stage and round are separate controls because they are separate
          decisions — "they reached interview" and "which round" — even though
          they are stored as one composite value. A flat list of every
          combination would be fifteen options to scan for two clicks. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="status-stage" className="mb-1 block text-xs font-medium text-secondary">
            Stage
          </label>
          <Select
            id="status-stage"
            value={current.stage}
            disabled={pending}
            onChange={(event) => {
              const stage = event.target.value
              // Moving into a levelled stage starts at L1 rather than leaving
              // the round blank, which would not be a valid status.
              onChange(formatStatus(stage, stageTakesLevel(stage) ? current.level ?? 'L1' : null))
            }}
          >
            {STATUS_STAGES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="status-level" className="mb-1 block text-xs font-medium text-secondary">
            Round
          </label>
          <Select
            id="status-level"
            value={current.level ?? ''}
            disabled={pending || !stageTakesLevel(current.stage)}
            onChange={(event) => onChange(formatStatus(current.stage, event.target.value))}
          >
            {stageTakesLevel(current.stage) ? (
              STATUS_LEVELS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))
            ) : (
              <option value="">Not applicable</option>
            )}
          </Select>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {entries.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-secondary">
            History
          </h3>
          <ol className="space-y-3 border-l border-border pl-4">
            {entries.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`} className="relative text-xs">
                <span
                  className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-border-strong ring-2 ring-white"
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {entry.fromStatus && (
                    <>
                      <StatusBadge status={entry.fromStatus} />
                      <span className="text-muted" aria-hidden="true">
                        →
                      </span>
                    </>
                  )}
                  <StatusBadge status={entry.toStatus} />
                </div>
                <p className="mt-1 text-secondary">
                  {entry.author || 'Unknown'} · {formatDateTime(entry.timestamp)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
