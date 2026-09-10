'use client'

import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { STATUS_COLORS, STATUS_STAGES, type StatusStage } from '@/lib/constants'

/**
 * Multi-select for the status filter.
 *
 * A native `<select multiple>` would be the smaller change, but ctrl-clicking
 * rows is not a discoverable way to pick three statuses, and it cannot show the
 * stage colours the rest of the dashboard keys off. So this is a disclosure
 * button over a checkbox list, built from real `<input type="checkbox">`
 * elements so keyboard and screen-reader behaviour comes for free.
 *
 * Selections are held locally while the panel is open and committed when it
 * closes. Committing on every tick would push a navigation per checkbox — the
 * one thing multi-select exists to avoid.
 *
 * Options are stages, not rounds: filtering by Interview is meant to return L1,
 * L2 and L3 together (`buildFilter` turns a levelled stage into a prefix
 * match).
 */
export function StatusFilter({
  selected,
  onChange,
}: {
  selected: string[]
  /** Called with the full selection once, when the panel closes. */
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(selected)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  // Re-sync when the URL changes from elsewhere — Clear, the summary tiles, or
  // the Back button. Skipped while open so a commit-in-flight cannot yank the
  // boxes out from under the recruiter.
  useEffect(() => {
    if (!open) setDraft(selected)
  }, [selected, open])

  function commit(next: string[]) {
    setOpen(false)
    // Order-insensitive: re-navigating to the same filter would reset the
    // table's loaded pages for nothing.
    const same =
      next.length === selected.length && next.every((value) => selected.includes(value))
    if (!same) onChange(next)
  }

  // Outside click and Escape both commit, so there is no way to tick a box and
  // lose it by dismissing the panel.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) commit(draft)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') commit(draft)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  })

  function toggle(stage: StatusStage) {
    setDraft((current) =>
      current.includes(stage) ? current.filter((value) => value !== stage) : [...current, stage],
    )
  }

  const label =
    draft.length === 0
      ? 'All statuses'
      : draft.length === 1
        ? draft[0]
        : `${draft.length} statuses`

  return (
    <div ref={containerRef} className="relative">
      <span id={`${panelId}-label`} className="mb-1 block text-xs font-medium text-secondary">
        Status
      </span>

      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-labelledby={`${panelId}-label ${panelId}-value`}
        onClick={() => (open ? commit(draft) : setOpen(true))}
        className={clsx(
          'flex h-10 w-48 items-center justify-between gap-2 rounded-md border bg-white px-3',
          'text-left text-sm text-ink transition-colors focus:border-brand focus:outline-none',
          draft.length > 0 ? 'border-brand' : 'border-border',
        )}
      >
        <span id={`${panelId}-value`} className="truncate">
          {label}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={clsx('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-labelledby={`${panelId}-label`}
          className="absolute left-0 top-full z-40 mt-1 w-56 rounded-lg border border-border bg-white p-1 shadow-sm"
        >
          {STATUS_STAGES.map((stage) => {
            const checked = draft.includes(stage)
            return (
              <label
                key={stage}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink transition-colors hover:bg-surface"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(stage)}
                  // `accent-*`, not `text-*`: these are unstyled native checkboxes
                  // (no forms plugin), so accent-color is what actually tints them.
                  className="h-4 w-4 accent-brand"
                />
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[stage] }}
                />
                <span className="truncate">{stage}</span>
              </label>
            )
          })}

          <div className="mt-1 flex items-center justify-between border-t border-border px-2 pb-1 pt-2">
            <button
              type="button"
              onClick={() => setDraft([])}
              disabled={draft.length === 0}
              className="text-xs font-medium text-secondary transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => commit(draft)}
              className="text-xs font-medium text-brand transition-colors hover:text-brand-hover"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
