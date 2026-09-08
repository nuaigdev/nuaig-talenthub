'use client'

import clsx from 'clsx'
import { APPLY_SECTIONS, type ApplySectionId } from '@/lib/constants'

/**
 * Section overview for the single-page application form.
 *
 * Replaces the wizard's horizontal step indicator (spec.md §6.1). It is an
 * overview, not a gate — every section is on the page already, so clicking a
 * row scrolls rather than navigating, and nothing here can block progress.
 *
 * The active row is driven by scroll position in `ApplyWizard`. Completion
 * ticks are a real signal — they reflect whether that section's fields actually
 * validate — so a candidate can see what is still outstanding before submitting
 * rather than discovering it from an error summary.
 */
export function SectionNav({
  active,
  complete,
  onJump,
}: {
  active: ApplySectionId
  complete: Record<ApplySectionId, boolean>
  onJump: (id: ApplySectionId) => void
}) {
  const doneCount = APPLY_SECTIONS.filter((s) => complete[s.id]).length

  return (
    <nav aria-label="Form sections" className="lg:sticky lg:top-24">
      <p className="mb-3 hidden text-xs font-medium uppercase tracking-wide text-secondary lg:block">
        Your application
      </p>

      {/* Horizontal and scrollable on narrow screens, vertical from lg up. */}
      <ol className="flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0">
        {APPLY_SECTIONS.map((section, index) => {
          const isActive = section.id === active
          const isDone = complete[section.id]

          return (
            <li key={section.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onJump(section.id)}
                aria-current={isActive ? 'true' : undefined}
                className={clsx(
                  'flex w-full items-center gap-2.5 whitespace-nowrap rounded-md border-l-2 px-3 py-2 text-left text-sm transition-colors lg:whitespace-normal',
                  isActive
                    ? 'border-brand bg-brand-subtle font-medium text-brand'
                    : 'border-transparent text-secondary hover:bg-surface hover:text-ink',
                )}
              >
                <span
                  className={clsx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                    isDone && 'bg-[#16A34A1F] text-[#16A34A]',
                    !isDone && isActive && 'bg-brand text-white',
                    !isDone && !isActive && 'border border-border-strong text-muted',
                  )}
                  aria-hidden="true"
                >
                  {isDone ? '✓' : index + 1}
                </span>
                {section.label}
                {isDone && <span className="sr-only"> (complete)</span>}
              </button>
            </li>
          )
        })}
      </ol>

      <p aria-live="polite" className="mt-3 hidden px-3 text-xs text-muted lg:block">
        {doneCount} of {APPLY_SECTIONS.length} sections complete
      </p>
    </nav>
  )
}
