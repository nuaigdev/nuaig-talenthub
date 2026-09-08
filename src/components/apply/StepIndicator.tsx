import clsx from 'clsx'
import { APPLY_STEPS } from '@/lib/constants'

/**
 * Horizontal step indicator that sits under the public header (spec.md §6.1).
 * This replaces any side navigation — the application has no sidebar anywhere.
 *
 * Rendered as an ordered list so the sequence is conveyed structurally, with
 * `aria-current` marking the active step and a plain-text "Step N of 5" line
 * that stays useful when the rail collapses on narrow screens.
 */
export function StepIndicator({ current }: { current: number }) {
  return (
    <nav aria-label="Application progress" className="border-b border-border bg-surface">
      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
        <p className="text-xs font-medium text-secondary sm:hidden">
          Step {current + 1} of {APPLY_STEPS.length} — {APPLY_STEPS[current]}
        </p>

        <ol className="hidden items-center gap-2 sm:flex">
          {APPLY_STEPS.map((label, index) => {
            const done = index < current
            const active = index === current
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={clsx(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    active && 'bg-brand text-white',
                    done && 'bg-brand-subtle text-brand',
                    !active && !done && 'border border-border-strong text-muted',
                  )}
                  aria-hidden="true"
                >
                  {done ? '✓' : index + 1}
                </span>
                <span
                  aria-current={active ? 'step' : undefined}
                  className={clsx(
                    'whitespace-nowrap text-xs font-medium transition-colors',
                    active ? 'text-ink' : 'text-secondary',
                  )}
                >
                  <span className="sr-only">
                    Step {index + 1} of {APPLY_STEPS.length}:{' '}
                  </span>
                  {label}
                </span>
                {index < APPLY_STEPS.length - 1 && (
                  <span
                    className={clsx(
                      'ml-1 hidden h-px flex-1 md:block',
                      done ? 'bg-brand' : 'bg-border',
                    )}
                    aria-hidden="true"
                  />
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </nav>
  )
}
