'use client'

import { useState, useTransition } from 'react'
import { Alert, Button, Card, Input, Spinner } from '@/components/ui'
import type { PositionRecord } from '@/lib/graph/positions'
import { addPositionAction, setPositionActiveAction } from '@/app/recruiter/positions-actions'

/**
 * Add and retire open positions.
 *
 * Retiring rather than deleting is the whole design: an inactive position
 * disappears from the public application form but stays readable on the records
 * of everyone who already applied for it.
 */
export function PositionsManager({
  positions,
  configured,
}: {
  positions: PositionRecord[]
  /** False when the Positions list has not been created yet. */
  configured: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  function add(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setError(null)

    const formData = new FormData()
    formData.set('title', title)

    startTransition(async () => {
      const result = await addPositionAction(formData)
      if (result.ok) setTitle('')
      else setError(result.error)
    })
  }

  function toggle(record: PositionRecord) {
    setError(null)
    startTransition(async () => {
      const result = await setPositionActiveAction(record.itemId, !record.active)
      if (!result.ok) setError(result.error)
    })
  }

  const activeCount = positions.filter((p) => p.active).length

  return (
    <div className="max-w-3xl space-y-6">
      {!configured && (
        <Alert tone="info" title="Positions list not configured">
          These are the built-in defaults. To manage positions here, an administrator needs to
          create a <strong>Positions</strong> SharePoint list and set{' '}
          <code>SHAREPOINT_POSITIONS_LIST_ID</code> — see SHAREPOINT_SETUP.md.
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-ink">Add a position</h2>
        <p className="mt-0.5 text-sm text-secondary">
          It appears on the application form immediately.
        </p>

        <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="new-position" className="mb-1 block text-xs font-medium text-secondary">
              Position name
            </label>
            <Input
              id="new-position"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Machine Learning Engineer"
              maxLength={150}
              disabled={pending || !configured}
            />
          </div>
          <Button type="submit" disabled={pending || !title.trim() || !configured}>
            {pending && <Spinner />}
            Add position
          </Button>
        </form>

        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Positions</h2>
          <p className="text-xs text-secondary">
            {activeCount} open · {positions.length - activeCount} closed
          </p>
        </div>

        {positions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-secondary">No positions yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {positions.map((record) => (
              <li
                key={record.itemId || record.title}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: record.active ? '#16A34A' : '#9CA3AF' }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm text-ink">{record.title}</span>
                  {!record.active && (
                    <span className="shrink-0 text-xs text-muted">Closed</span>
                  )}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending || !configured}
                  onClick={() => toggle(record)}
                >
                  {record.active ? 'Close' : 'Reopen'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted">
        Closing a position hides it from the application form. Candidates who already applied
        for it keep it on their record.
      </p>
    </div>
  )
}
