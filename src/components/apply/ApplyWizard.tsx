'use client'

import { useState } from 'react'
import { Alert, Button, Card, Field, Input, Select, Spinner } from '@/components/ui'
import { StepIndicator } from './StepIndicator'
import { FileUploadField, type UploadState } from './FileUploadField'
import {
  APPLY_STEPS,
  CONSENT_TEXT,
  NOTICE_PERIODS,
  POSITIONS,
  VIDEO_INSTRUCTIONS,
} from '@/lib/constants'
import { fieldErrors, personalInfoSchema, positionSchema } from '@/lib/validation'

/**
 * The five-step candidate application (spec.md §9).
 *
 * Step state lives here rather than in the URL: the uploads are tied to an
 * in-memory draft token, so a reload cannot resume them anyway, and a candidate
 * who navigates back keeps everything they have already entered.
 *
 * Uploaded files are held as drive item ids. Moving between steps never
 * re-uploads, and a failed submit leaves successful uploads intact so the retry
 * path costs nothing (§9, partial-failure handling).
 */

export type UploadLimits = {
  maxResumeBytes: number
  maxVideoBytes: number
  resumeTypes: string[]
  videoTypes: string[]
}

type PersonalState = {
  fullName: string
  email: string
  phone: string
  location: string
  linkedIn: string
}

type PositionState = {
  position: string
  yearsExperience: string
  currentCompany: string
  currentJobTitle: string
  currentCTC: string
  expectedCTC: string
  noticePeriod: string
}

const EMPTY_PERSONAL: PersonalState = {
  fullName: '',
  email: '',
  phone: '',
  location: '',
  linkedIn: '',
}

const EMPTY_POSITION: PositionState = {
  position: '',
  yearsExperience: '',
  currentCompany: '',
  currentJobTitle: '',
  currentCTC: '',
  expectedCTC: '',
  noticePeriod: '',
}

export function ApplyWizard({ limits }: { limits: UploadLimits }) {
  const [step, setStep] = useState(0)
  const [personal, setPersonal] = useState(EMPTY_PERSONAL)
  const [position, setPosition] = useState(EMPTY_POSITION)
  const [resume, setResume] = useState<UploadState>({ phase: 'empty' })
  const [video, setVideo] = useState<UploadState>({ phase: 'empty' })
  const [consent, setConsent] = useState(false)
  const [draftToken, setDraftToken] = useState<string | undefined>()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<{ candidateId: string; emailSent: boolean } | null>(null)

  if (result) {
    return <SuccessScreen candidateId={result.candidateId} emailSent={result.emailSent} />
  }

  function goTo(next: number) {
    setErrors({})
    setSubmitError(null)
    setStep(next)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function validateAndAdvance() {
    if (step === 0) {
      const parsed = personalInfoSchema.safeParse(personal)
      if (!parsed.success) return setErrors(fieldErrors(parsed.error))
      return goTo(1)
    }

    if (step === 1) {
      const parsed = positionSchema.safeParse({
        ...position,
        yearsExperience:
          position.yearsExperience === '' ? Number.NaN : Number(position.yearsExperience),
      })
      if (!parsed.success) return setErrors(fieldErrors(parsed.error))
      return goTo(2)
    }

    return goTo(step + 1)
  }

  async function submit() {
    if (resume.phase !== 'done' || video.phase !== 'done' || !draftToken) {
      setSubmitError('Please complete both uploads before submitting.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch('/api/apply/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...personal,
          ...position,
          yearsExperience: Number(position.yearsExperience),
          resume: resume.item,
          video: video.item,
          consent: true,
          draftToken,
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        setSubmitError(payload.error || 'Something went wrong. Please try again.')
        if (payload.fields) setErrors(payload.fields)
        return
      }

      setResult({ candidateId: payload.candidateId, emailSent: payload.emailSent !== false })
    } catch {
      setSubmitError(
        'Your application could not be completed because of a temporary system issue. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const canAdvance =
    step === 2 ? resume.phase === 'done' : step === 3 ? video.phase === 'done' : true

  return (
    <>
      <StepIndicator current={step} />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-ink">{APPLY_STEPS[step]}</h1>
          <p className="mt-1 text-sm text-secondary">{STEP_BLURBS[step]}</p>
        </header>

        <Card className="p-5 sm:p-7">
          {step === 0 && (
            <PersonalStep value={personal} onChange={setPersonal} errors={errors} />
          )}
          {step === 1 && <PositionStep value={position} onChange={setPosition} errors={errors} />}

          {step === 2 && (
            <FileUploadField
              kind="resume"
              label="Resume"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              acceptLabel="a PDF, DOC or DOCX"
              maxBytes={limits.maxResumeBytes}
              allowedTypes={limits.resumeTypes}
              state={resume}
              onState={setResume}
              draftToken={draftToken}
              onDraftToken={setDraftToken}
            />
          )}

          {step === 3 && (
            <div className="space-y-5">
              <Alert tone="info" title="What to record">
                {VIDEO_INSTRUCTIONS}
              </Alert>
              <FileUploadField
                kind="video"
                label="Introduction video"
                accept=".mp4,.mov,video/mp4,video/quicktime"
                acceptLabel="an MP4 or MOV"
                maxBytes={limits.maxVideoBytes}
                allowedTypes={limits.videoTypes}
                state={video}
                onState={setVideo}
                draftToken={draftToken}
                onDraftToken={setDraftToken}
              />
              <p className="text-xs text-secondary">
                Large files upload directly and securely. Keep this tab open until the
                progress bar reaches 100%.
              </p>
            </div>
          )}

          {step === 4 && (
            <ConsentStep
              checked={consent}
              onChange={setConsent}
              personal={personal}
              position={position}
              resumeName={resume.phase === 'done' ? resume.originalName : ''}
              videoName={video.phase === 'done' ? video.originalName : ''}
            />
          )}

          {submitError && (
            <div className="mt-5">
              <Alert tone="error">{submitError}</Alert>
            </div>
          )}
        </Card>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => goTo(step - 1)}
            disabled={step === 0 || submitting}
          >
            Back
          </Button>

          {step < APPLY_STEPS.length - 1 ? (
            <Button type="button" onClick={validateAndAdvance} disabled={!canAdvance}>
              Continue
            </Button>
          ) : (
            <Button type="button" onClick={() => void submit()} disabled={!consent || submitting}>
              {submitting && <Spinner />}
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

const STEP_BLURBS = [
  'Tell us how to reach you.',
  'Which role are you applying for?',
  'Upload your most recent resume.',
  'Record a short introduction so we can get to know you.',
  'Review and confirm your submission.',
]

// ---------------------------------------------------------------------------

function PersonalStep({
  value,
  onChange,
  errors,
}: {
  value: PersonalState
  onChange: (next: PersonalState) => void
  errors: Record<string, string>
}) {
  const set = (key: keyof PersonalState) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: event.target.value })

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field id="fullName" label="Full name" required error={errors.fullName}>
          <Input
            id="fullName"
            value={value.fullName}
            onChange={set('fullName')}
            autoComplete="name"
            invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? 'fullName-error' : undefined}
          />
        </Field>
      </div>

      <Field id="email" label="Email" required error={errors.email}>
        <Input
          id="email"
          type="email"
          value={value.email}
          onChange={set('email')}
          autoComplete="email"
          invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
      </Field>

      <Field id="phone" label="Phone" required error={errors.phone}>
        <Input
          id="phone"
          type="tel"
          value={value.phone}
          onChange={set('phone')}
          autoComplete="tel"
          invalid={!!errors.phone}
          aria-describedby={errors.phone ? 'phone-error' : undefined}
        />
      </Field>

      <Field id="location" label="City / location" required error={errors.location}>
        <Input
          id="location"
          value={value.location}
          onChange={set('location')}
          autoComplete="address-level2"
          invalid={!!errors.location}
          aria-describedby={errors.location ? 'location-error' : undefined}
        />
      </Field>

      <Field
        id="linkedIn"
        label="LinkedIn profile"
        hint="Optional"
        error={errors.linkedIn}
      >
        <Input
          id="linkedIn"
          type="url"
          placeholder="https://linkedin.com/in/…"
          value={value.linkedIn}
          onChange={set('linkedIn')}
          invalid={!!errors.linkedIn}
          aria-describedby={errors.linkedIn ? 'linkedIn-error' : 'linkedIn-hint'}
        />
      </Field>
    </div>
  )
}

function PositionStep({
  value,
  onChange,
  errors,
}: {
  value: PositionState
  onChange: (next: PositionState) => void
  errors: Record<string, string>
}) {
  const set =
    (key: keyof PositionState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...value, [key]: event.target.value })

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field id="position" label="Position applying for" required error={errors.position}>
        <Select
          id="position"
          value={value.position}
          onChange={set('position')}
          invalid={!!errors.position}
          aria-describedby={errors.position ? 'position-error' : undefined}
        >
          <option value="">Select a position</option>
          {POSITIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="yearsExperience" label="Years of experience" required error={errors.yearsExperience}>
        <Input
          id="yearsExperience"
          type="number"
          min={0}
          max={60}
          step={0.5}
          inputMode="decimal"
          value={value.yearsExperience}
          onChange={set('yearsExperience')}
          invalid={!!errors.yearsExperience}
          aria-describedby={errors.yearsExperience ? 'yearsExperience-error' : undefined}
        />
      </Field>

      <Field id="currentCompany" label="Current company" hint="Optional">
        <Input id="currentCompany" value={value.currentCompany} onChange={set('currentCompany')} />
      </Field>

      <Field id="currentJobTitle" label="Current job title" hint="Optional">
        <Input
          id="currentJobTitle"
          value={value.currentJobTitle}
          onChange={set('currentJobTitle')}
        />
      </Field>

      <Field id="currentCTC" label="Current CTC" hint="Optional — include the currency">
        <Input id="currentCTC" value={value.currentCTC} onChange={set('currentCTC')} />
      </Field>

      <Field id="expectedCTC" label="Expected CTC" hint="Optional — include the currency">
        <Input id="expectedCTC" value={value.expectedCTC} onChange={set('expectedCTC')} />
      </Field>

      <Field id="noticePeriod" label="Notice period" required error={errors.noticePeriod}>
        <Select
          id="noticePeriod"
          value={value.noticePeriod}
          onChange={set('noticePeriod')}
          invalid={!!errors.noticePeriod}
          aria-describedby={errors.noticePeriod ? 'noticePeriod-error' : undefined}
        >
          <option value="">Select a notice period</option>
          {NOTICE_PERIODS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

function ConsentStep({
  checked,
  onChange,
  personal,
  position,
  resumeName,
  videoName,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  personal: PersonalState
  position: PositionState
  resumeName: string
  videoName: string
}) {
  const rows: Array<[string, string]> = [
    ['Name', personal.fullName],
    ['Email', personal.email],
    ['Phone', personal.phone],
    ['Location', personal.location],
    ['Position', position.position],
    ['Experience', position.yearsExperience ? `${position.yearsExperience} years` : ''],
    ['Notice period', position.noticePeriod],
    ['Resume', resumeName],
    ['Introduction video', videoName],
  ]

  return (
    <div className="space-y-6">
      <dl className="divide-y divide-border rounded-md border border-border">
        {rows.map(([label, entry]) => (
          <div key={label} className="grid grid-cols-3 gap-3 px-4 py-2.5 text-sm">
            <dt className="text-secondary">{label}</dt>
            <dd className="col-span-2 truncate font-medium text-ink">{entry || '—'}</dd>
          </div>
        ))}
      </dl>

      <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface p-4 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#069BDF]"
        />
        <span className="text-ink">{CONSENT_TEXT}</span>
      </label>
    </div>
  )
}

function SuccessScreen({ candidateId, emailSent }: { candidateId: string; emailSent: boolean }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#16A34A1F] text-xl text-[#16A34A]"
        aria-hidden="true"
      >
        ✓
      </div>

      <h1 className="mt-5 text-2xl font-semibold text-ink">Application received</h1>
      <p className="mt-2 text-secondary">
        Thank you for applying. Our team will review your application and be in touch if there
        is a match.
      </p>

      <div className="mt-7 rounded-lg border border-border bg-brand-subtle px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-secondary">
          Your Candidate ID
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-brand">{candidateId}</p>
      </div>

      <p className="mt-5 text-sm text-secondary">
        {emailSent
          ? 'We have emailed you a copy of this reference. Please quote it in any correspondence with us.'
          : 'Please save this reference — quote it in any correspondence with us.'}
      </p>
    </div>
  )
}
