'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Alert, Button, Card, Input, Select, Spinner } from '@/components/ui'
import type { PositionRecord } from '@/lib/graph/positions'
import {
  addHiringManagerAction,
  addPositionAction,
  removeHiringManagerAction,
  setPositionActiveAction,
  setPositionOwnerAction,
} from '@/app/recruiter/positions-actions'

/**
 * Add and retire positions, and manage each position's hiring-manager roster.
 *
 * Access mirrors the server: a recruiter only ever receives the positions they
 * own or help hire for; an admin receives all. Roster editing (add/remove a
 * manager, open/close, assign owner) is shown only where the viewer is the
 * owner or an admin — and the server re-checks regardless, so hiding a control
 * is a courtesy, never the boundary.
 *
 * Retiring rather than deleting stays the design: an inactive position drops off
 * the public form but stays readable on the record of everyone who applied.
 */

type Recruiter = { email: string; displayName: string }

export function PositionsManager({
  positions: initialPositions,
  configured,
  viewerEmail,
  viewerIsAdmin,
  recruiters,
}: {
  positions: PositionRecord[]
  /** False when the Positions list has not been created yet. */
  configured: boolean
  viewerEmail: string
  viewerIsAdmin: boolean
  recruiters: Recruiter[]
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  // The table renders from local state, updated with the list each action
  // returns — a route refresh can be served by an instance with a stale cache.
  const [positions, setPositions] = useState(initialPositions)
  useEffect(() => setPositions(initialPositions), [initialPositions])

  const nameByEmail = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of recruiters) map.set(r.email.toLowerCase(), r.displayName)
    return map
  }, [recruiters])

  const label = (email: string) => nameByEmail.get(email.toLowerCase()) ?? email

  function run(action: () => Promise<{ ok: true; positions: PositionRecord[] } | { ok: false; error: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) setPositions(result.positions)
      else setError(result.error)
    })
  }

  function add(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    const formData = new FormData()
    formData.set('title', title)
    run(async () => {
      const result = await addPositionAction(formData)
      if (result.ok) setTitle('')
      return result
    })
  }

  const activeCount = positions.filter((p) => p.active).length

  return (
    <div className="max-w-4xl space-y-6">
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
          It appears on the application form immediately, and you become its owner.
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
          <h2 className="text-sm font-semibold text-ink">
            {viewerIsAdmin ? 'All positions' : 'Your positions'}
          </h2>
          <p className="text-xs text-secondary">
            {activeCount} open · {positions.length - activeCount} closed
          </p>
        </div>

        {positions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-secondary">
            {viewerIsAdmin
              ? 'No positions yet.'
              : 'You are not on any position’s hiring team yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {positions.map((record) => (
              <PositionRow
                key={record.itemId || record.title}
                record={record}
                canManage={viewerIsAdmin || record.ownerEmail === viewerEmail.toLowerCase()}
                isAdmin={viewerIsAdmin}
                pending={pending}
                configured={configured}
                recruiters={recruiters}
                label={label}
                run={run}
              />
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted">
        Closing a position hides it from the application form. Candidates who already applied for it
        keep it on their record. Only the owner (or an admin) can change a position’s hiring team;
        the owner cannot be removed.
      </p>
    </div>
  )
}

function PositionRow({
  record,
  canManage,
  isAdmin,
  pending,
  configured,
  recruiters,
  label,
  run,
}: {
  record: PositionRecord
  canManage: boolean
  isAdmin: boolean
  pending: boolean
  configured: boolean
  recruiters: Recruiter[]
  label: (email: string) => string
  run: (
    action: () => Promise<{ ok: true; positions: PositionRecord[] } | { ok: false; error: string }>,
  ) => void
}) {
  const [toAdd, setToAdd] = useState('')

  // Non-owner managers, i.e. everyone on the team who is not the owner.
  const coManagers = record.hiringManagers.filter((m) => m !== record.ownerEmail)
  // Recruiters not already on this team, offered in the add picker.
  const addable = recruiters.filter((r) => !record.hiringManagers.includes(r.email.toLowerCase()))
  const unowned = !record.ownerEmail

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: record.active ? '#16A34A' : '#9CA3AF' }}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium text-ink">{record.title}</span>
          {!record.active && <span className="shrink-0 text-xs text-muted">Closed</span>}
        </span>

        {canManage && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || !configured}
            onClick={() => run(() => setPositionActiveAction(record.itemId, !record.active))}
          >
            {record.active ? 'Close' : 'Reopen'}
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-2 pl-4 text-sm">
        {/* Owner */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-secondary">
            Owner
          </span>
          {unowned ? (
            <span className="text-xs text-muted">Unassigned</span>
          ) : (
            <span className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-medium text-brand-deep">
              {label(record.ownerEmail)}
            </span>
          )}
          {isAdmin && (
            <AssignPicker
              recruiters={record.hiringManagers.length ? recruiters : recruiters}
              placeholder={unowned ? 'Assign owner…' : 'Reassign owner…'}
              disabled={pending || !configured}
              onPick={(email) => run(() => setPositionOwnerAction(record.itemId, email))}
            />
          )}
        </div>

        {/* Hiring managers */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-secondary">
            Team
          </span>
          {coManagers.length === 0 && (
            <span className="text-xs text-muted">Just the owner</span>
          )}
          {coManagers.map((email) => (
            <span
              key={email}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-ink"
            >
              {label(email)}
              {canManage && (
                <button
                  type="button"
                  aria-label={`Remove ${label(email)}`}
                  disabled={pending || !configured}
                  onClick={() => run(() => removeHiringManagerAction(record.itemId, email))}
                  className="rounded text-muted transition-colors hover:text-[#DC2626] disabled:opacity-50"
                >
                  <svg viewBox="0 0 14 14" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                  </svg>
                </button>
              )}
            </span>
          ))}

          {canManage && addable.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Select
                aria-label={`Add a hiring manager to ${record.title}`}
                value={toAdd}
                onChange={(event) => setToAdd(event.target.value)}
                disabled={pending || !configured}
                className="h-8 py-0 text-xs"
              >
                <option value="">Add manager…</option>
                {addable.map((r) => (
                  <option key={r.email} value={r.email}>
                    {r.displayName}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || !configured || !toAdd}
                onClick={() =>
                  run(async () => {
                    const result = await addHiringManagerAction(record.itemId, toAdd)
                    if (result.ok) setToAdd('')
                    return result
                  })
                }
              >
                Add
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** A one-shot recruiter picker that fires `onPick` on selection and resets. */
function AssignPicker({
  recruiters,
  placeholder,
  disabled,
  onPick,
}: {
  recruiters: Recruiter[]
  placeholder: string
  disabled: boolean
  onPick: (email: string) => void
}) {
  return (
    <Select
      aria-label={placeholder}
      value=""
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value) onPick(event.target.value)
      }}
      className="h-8 w-auto py-0 text-xs"
    >
      <option value="">{placeholder}</option>
      {recruiters.map((r) => (
        <option key={r.email} value={r.email}>
          {r.displayName}
        </option>
      ))}
    </Select>
  )
}
