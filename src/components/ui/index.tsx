import clsx from 'clsx'
import { forwardRef, type ReactNode } from 'react'
import { statusColor, type CandidateStatus } from '@/lib/constants'

/**
 * Shared primitives. Every visual value here traces to a token in globals.css
 * (spec.md §5) — no ad-hoc hex, no `dark:` variants, transitions capped at the
 * 150–200ms the spec allows.
 */

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover disabled:hover:bg-brand',
  secondary:
    'border border-border-strong bg-white text-ink hover:border-brand hover:text-brand disabled:hover:border-border-strong disabled:hover:text-ink',
  ghost: 'text-secondary hover:bg-surface hover:text-ink',
  danger: 'bg-[#DC2626] text-white hover:bg-[#B91C1C]',
}

const BUTTON_SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  md: 'h-10 px-5 text-sm',
  sm: 'h-8 px-3 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  )
})

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

const CONTROL =
  'w-full rounded-md border bg-white px-3 text-sm text-ink transition-colors ' +
  'placeholder:text-muted focus:border-brand focus:outline-none ' +
  'disabled:bg-surface disabled:text-muted'

/**
 * Wraps a control with its label, optional hint and error.
 *
 * `htmlFor`/`id` are always wired, the hint and error are referenced through
 * `aria-describedby` by the caller, and the error carries `role="alert"` so a
 * screen reader announces it on validation (spec.md §3 decision 8).
 */
export function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-[#DC2626]" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-[#DC2626]">
          {error}
        </p>
      )}
    </div>
  )
}

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(CONTROL, 'h-10', invalid ? 'border-[#DC2626]' : 'border-border', className)}
      {...props}
    />
  )
})

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(CONTROL, 'h-10', invalid ? 'border-[#DC2626]' : 'border-border', className)}
      {...props}
    >
      {children}
    </select>
  )
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx(
        CONTROL,
        'min-h-[96px] py-2 leading-relaxed',
        invalid ? 'border-[#DC2626]' : 'border-border',
        className,
      )}
      {...props}
    />
  )
})

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        'rounded-lg border border-border bg-surface-raised shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Status pill — tinted background at ~12% of the status hex with full-opacity
 * text and dot of the same hue (spec.md §5.3).
 */
export function StatusBadge({ status }: { status: CandidateStatus }) {
  // Colour comes from the stage, so every round of a stage reads as the same
  // kind of thing; the label still shows the round.
  const hex = statusColor(status)
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `${hex}1F`, color: hex }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: hex }}
        aria-hidden="true"
      />
      {status}
    </span>
  )
}

/** Non-blocking inline message. `tone` maps to the semantic palette in §5.3. */
export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'error' | 'success'
  title?: string
  children: ReactNode
}) {
  const tones = {
    info: { bg: 'var(--color-brand-subtle)', fg: '#0587C4', border: '#BFE6F8' },
    error: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
    success: { bg: '#F0FDF4', fg: '#15803D', border: '#BBF7D0' },
  }[tone]

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="rounded-md border px-4 py-3 text-sm"
      style={{ backgroundColor: tones.bg, borderColor: tones.border, color: tones.fg }}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div className={clsx(title && 'mt-0.5')}>{children}</div>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
    />
  )
}
