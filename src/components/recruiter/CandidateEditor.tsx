'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '@/components/ui'
import {
  HIGHEST_QUALIFICATIONS,
  HOME_CITY,
  NOTICE_PERIODS,
  YES_NO,
} from '@/lib/constants'
import type { CandidateView } from '@/lib/candidate-view'
import { updateCandidateAction } from '@/app/recruiter/actions'

/**
 * Lets a recruiter correct a candidate's details — a mistyped email, a wrong
 * CTC — without asking them to reapply.
 *
 * These fields are genuinely meant to be overwritten, unlike notes and status,
 * where the whole design is that nothing is lost. What is preserved instead is
 * that the edit happened: the server appends a note naming every field changed
 * and its previous value, so the correction shows up in the timeline the team
 * already reads.
 *
 * The form validates against the same schema the public application uses, so a
 * recruiter cannot save a record the application itself would have rejected.
 */

type Values = Record<string, string>

function initialValues(candidate: CandidateView): Values {
  return {
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    location: candidate.location,
    willingToRelocate: candidate.willingToRelocate,
    linkedIn: candidate.linkedIn,
    position: candidate.position,
    yearsExperience: String(candidate.yearsExperience ?? ''),
    relevantExperience: String(candidate.relevantExperience ?? ''),
    currentlyEmployed: candidate.currentlyEmployed,
    currentCompany: candidate.currentCompany,
    currentJobTitle: candidate.currentJobTitle,
    currentCTC: candidate.currentCTC,
    variableComponent: candidate.variableComponent,
    expectedCTC: candidate.expectedCTC,
    ctcNegotiable: candidate.ctcNegotiable,
    noticePeriod: candidate.noticePeriod,
    noticePeriodNegotiable: candidate.noticePeriodNegotiable,
    highestQualification: candidate.highestQualification,
    undergraduateCollege: candidate.undergraduateCollege,
    undergraduateCGPA: candidate.undergraduateCGPA,
    postgraduateCollege: candidate.postgraduateCollege,
    postgraduateCGPA: candidate.postgraduateCGPA,
    certifications: candidate.certifications,
    agencyCode: candidate.agencyCode,
  }
}

export function CandidateEditor({
  candidate,
  positions,
}: {
  candidate: CandidateView
  /** Live options, so a correction cannot set a role that is no longer open. */
  positions: string[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit details
      </Button>

      {open && (
        <EditDialog
          candidate={candidate}
          positions={positions}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function EditDialog({
  candidate,
  positions,
  onClose,
}: {
  candidate: CandidateView
  positions: string[]
  onClose: () => void
}) {
  const [values, setValues] = useState<Values>(() => initialValues(candidate))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  const set = (key: string) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }))

  // A position that has since been closed would otherwise vanish from the
  // dropdown and look like the recruiter cleared it.
  const positionOptions = positions.includes(values.position)
    ? positions
    : [values.position, ...positions].filter(Boolean)

  function save() {
    setFormError(null)
    setErrors({})

    startTransition(async () => {
      const result = await updateCandidateAction(candidate.candidateId, values)
      if (result.ok) {
        onClose()
        return
      }
      setFormError(result.error)
      if (result.fields) setErrors(result.fields)
    })
  }

  const outsideHomeCity =
    values.location.trim().toLowerCase() !== HOME_CITY.toLowerCase() && !!values.location.trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${candidate.fullName}`}
        className="my-auto w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-surface-raised shadow-card"
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">Edit details</h2>
            <p className="truncate text-xs text-secondary">
              {candidate.fullName} · {candidate.candidateId}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-5 py-5">
          <Alert tone="info">
            Corrections are recorded as a note on this candidate, naming what changed.
          </Alert>

          <Group title="Personal">
            <Text id="fullName" label="Full name" values={values} errors={errors} set={set} />
            <Text id="email" label="Email" values={values} errors={errors} set={set} />
            <Text id="phone" label="Phone" values={values} errors={errors} set={set} />
            <Text id="location" label="Location" values={values} errors={errors} set={set} />
            {outsideHomeCity && (
              <Choice
                id="willingToRelocate"
                label={`Willing to relocate to ${HOME_CITY}`}
                options={YES_NO}
                values={values}
                errors={errors}
                set={set}
              />
            )}
            <Text id="linkedIn" label="LinkedIn" values={values} errors={errors} set={set} />
          </Group>

          <Group title="Role & experience">
            <Choice
              id="position"
              label="Position"
              options={positionOptions}
              values={values}
              errors={errors}
              set={set}
            />
            <Text
              id="yearsExperience"
              label="Total experience (years)"
              type="number"
              values={values}
              errors={errors}
              set={set}
            />
            <Text
              id="relevantExperience"
              label="Relevant experience (years)"
              type="number"
              values={values}
              errors={errors}
              set={set}
            />
            <Choice
              id="currentlyEmployed"
              label="Currently employed"
              options={YES_NO}
              values={values}
              errors={errors}
              set={set}
            />
            {values.currentlyEmployed === 'Yes' && (
              <>
                <Text
                  id="currentCompany"
                  label="Current organisation"
                  values={values}
                  errors={errors}
                  set={set}
                />
                <Text
                  id="currentJobTitle"
                  label="Current job title"
                  values={values}
                  errors={errors}
                  set={set}
                />
              </>
            )}
            <Text id="currentCTC" label="Current CTC" values={values} errors={errors} set={set} />
            <Text
              id="variableComponent"
              label="Variable component"
              values={values}
              errors={errors}
              set={set}
            />
            <Text id="expectedCTC" label="Expected CTC" values={values} errors={errors} set={set} />
            <Choice
              id="ctcNegotiable"
              label="Expected CTC negotiable"
              options={YES_NO}
              values={values}
              errors={errors}
              set={set}
            />
            <Choice
              id="noticePeriod"
              label="Notice period"
              options={NOTICE_PERIODS}
              values={values}
              errors={errors}
              set={set}
            />
            <Choice
              id="noticePeriodNegotiable"
              label="Notice period negotiable"
              options={YES_NO}
              values={values}
              errors={errors}
              set={set}
            />
          </Group>

          <Group title="Education">
            <Choice
              id="highestQualification"
              label="Highest qualification"
              options={HIGHEST_QUALIFICATIONS}
              values={values}
              errors={errors}
              set={set}
            />
            <Text
              id="undergraduateCollege"
              label="Undergraduate college"
              values={values}
              errors={errors}
              set={set}
            />
            <Text
              id="undergraduateCGPA"
              label="Undergraduate CGPA"
              values={values}
              errors={errors}
              set={set}
            />
            <Text
              id="postgraduateCollege"
              label="Postgraduate college"
              values={values}
              errors={errors}
              set={set}
            />
            <Text
              id="postgraduateCGPA"
              label="Postgraduate CGPA"
              values={values}
              errors={errors}
              set={set}
            />
            <div className="sm:col-span-2">
              <Field id="certifications" label="Certifications" error={errors.certifications}>
                <Textarea
                  id="certifications"
                  value={values.certifications}
                  onChange={(event) => set('certifications')(event.target.value)}
                  maxLength={1000}
                />
              </Field>
            </div>
          </Group>

          <Group title="Referral">
            <Text id="agencyCode" label="Agency code" values={values} errors={errors} set={set} />
          </Group>

          {formError && <Alert tone="error">{formError}</Alert>}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-border px-5 py-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending && <Spinner />}
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-secondary">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

type ControlProps = {
  id: string
  label: string
  values: Values
  errors: Record<string, string>
  set: (key: string) => (value: string) => void
}

function Text({ id, label, type, values, errors, set }: ControlProps & { type?: string }) {
  return (
    <Field id={id} label={label} error={errors[id]}>
      <Input
        id={id}
        type={type}
        step={type === 'number' ? 0.5 : undefined}
        value={values[id] ?? ''}
        onChange={(event) => set(id)(event.target.value)}
        invalid={!!errors[id]}
      />
    </Field>
  )
}

function Choice({
  id,
  label,
  options,
  values,
  errors,
  set,
}: ControlProps & { options: readonly string[] }) {
  return (
    <Field id={id} label={label} error={errors[id]}>
      <Select
        id={id}
        value={values[id] ?? ''}
        onChange={(event) => set(id)(event.target.value)}
        invalid={!!errors[id]}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </Field>
  )
}
