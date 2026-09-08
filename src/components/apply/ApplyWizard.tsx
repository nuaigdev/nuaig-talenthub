'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Field, Input, Select, Spinner } from '@/components/ui'
import { SectionNav } from './SectionNav'
import { FileUploadField, type UploadState } from './FileUploadField'
import {
  APPLY_SECTIONS,
  CONSENT_TEXT,
  NOTICE_PERIODS,
  VIDEO_INSTRUCTIONS,
  type ApplySectionId,
} from '@/lib/constants'
import { fieldErrors, personalInfoSchema, positionSchema } from '@/lib/validation'

/**
 * The candidate application (spec.md §9), as one scrolling page.
 *
 * This was a five-step wizard. It is now a single form with a section rail that
 * tracks scroll position — a deliberate departure from §6.1's horizontal step
 * indicator, made because the form is short enough that gating it behind four
 * "Continue" clicks cost more than it helped.
 *
 * What the change does *not* alter: validation still runs per section, uploads
 * still go straight to Microsoft and are held as drive item ids, and a failed
 * submit still leaves successful uploads intact so a retry costs nothing
 * (§9, partial-failure handling).
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
  relevantExperience: string
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
  relevantExperience: '',
  currentCTC: '',
  expectedCTC: '',
  noticePeriod: '',
}

/** Where the top of a section must sit before the rail counts it as current. */
const ACTIVE_LINE_PX = 160

export function ApplyWizard({
  limits,
  positions,
}: {
  limits: UploadLimits
  /** Live options from the recruiter-managed Positions list. */
  positions: string[]
}) {
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
  const [active, setActive] = useState<ApplySectionId>('personal')

  const parsedPersonal = personalInfoSchema.safeParse(personal)
  const parsedPosition = positionSchema.safeParse({
    ...position,
    yearsExperience: position.yearsExperience === '' ? Number.NaN : Number(position.yearsExperience),
    relevantExperience:
      position.relevantExperience === '' ? Number.NaN : Number(position.relevantExperience),
  })

  const complete: Record<ApplySectionId, boolean> = {
    personal: parsedPersonal.success,
    position: parsedPosition.success,
    resume: resume.phase === 'done',
    video: video.phase === 'done',
    consent,
  }

  // --- scroll spy ---------------------------------------------------------
  // A plain scroll listener rather than IntersectionObserver: the rule is
  // "the last section whose top has crossed the line", which is trivial to
  // express directly and awkward to express as a set of intersection ratios.
  useEffect(() => {
    let frame = 0

    const measure = () => {
      frame = 0
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2

      if (atBottom) {
        setActive(APPLY_SECTIONS[APPLY_SECTIONS.length - 1].id)
        return
      }

      let current: ApplySectionId = APPLY_SECTIONS[0].id
      for (const section of APPLY_SECTIONS) {
        const element = document.getElementById(section.id)
        if (element && element.getBoundingClientRect().top <= ACTIVE_LINE_PX) {
          current = section.id
        }
      }
      setActive(current)
    }

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [result])

  const jumpTo = useCallback((id: ApplySectionId) => {
    const element = document.getElementById(id)
    if (!element) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }, [])

  async function submit() {
    // Validate everything at once and send the candidate to the first problem,
    // rather than letting them press Submit repeatedly to discover them.
    const collected: Record<string, string> = {}
    if (!parsedPersonal.success) Object.assign(collected, fieldErrors(parsedPersonal.error))
    if (!parsedPosition.success) Object.assign(collected, fieldErrors(parsedPosition.error))

    setErrors(collected)

    const firstIncomplete = APPLY_SECTIONS.find((section) => !complete[section.id])
    if (firstIncomplete) {
      setSubmitError(
        firstIncomplete.id === 'consent'
          ? 'Please confirm your consent before submitting.'
          : `Please complete the ${firstIncomplete.label.toLowerCase()} section.`,
      )
      jumpTo(firstIncomplete.id)
      return
    }

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
          relevantExperience: Number(position.relevantExperience),
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

  if (result) {
    return <SuccessScreen candidateId={result.candidateId} emailSent={result.emailSent} />
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-semibold text-ink">Apply to NuAIg</h1>
        <p className="mt-2 text-secondary">
          One page, five short sections. Your uploads start as soon as you choose a file, so
          nothing is waiting on you at the end.
        </p>
      </header>

      <div className="gap-10 lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="sticky top-16 z-30 -mx-4 mb-6 border-b border-border bg-bg px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:m-0 lg:border-0 lg:bg-transparent lg:p-0">
          <SectionNav active={active} complete={complete} onJump={jumpTo} />
        </div>

        <div className="min-w-0 space-y-8">
          <FormSection id="personal">
            <PersonalStep value={personal} onChange={setPersonal} errors={errors} />
          </FormSection>

          <FormSection id="position">
            <PositionStep
              value={position}
              onChange={setPosition}
              errors={errors}
              positions={positions}
            />
          </FormSection>

          <FormSection id="resume">
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
          </FormSection>

          <FormSection id="video">
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
                Large files upload directly and securely. Keep this tab open until the progress
                bar reaches 100%.
              </p>
            </div>
          </FormSection>

          <FormSection id="consent">
            <ConsentStep
              checked={consent}
              onChange={setConsent}
              personal={personal}
              position={position}
              resumeName={resume.phase === 'done' ? resume.originalName : ''}
              videoName={video.phase === 'done' ? video.originalName : ''}
            />
          </FormSection>

          {submitError && <Alert tone="error">{submitError}</Alert>}

          <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border pt-6">
            <p className="mr-auto text-xs text-muted">
              You can review everything above before submitting.
            </p>
            <Button type="button" onClick={() => void submit()} disabled={submitting}>
              {submitting && <Spinner />}
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One section of the form. `scroll-mt` clears the sticky header and the mobile
 * section rail, so a jump lands with the heading visible rather than tucked
 * underneath them.
 */
function FormSection({ id, children }: { id: ApplySectionId; children: React.ReactNode }) {
  const section = APPLY_SECTIONS.find((entry) => entry.id === id)!
  const ref = useRef<HTMLElement>(null)

  return (
    <section ref={ref} id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-40 lg:scroll-mt-24">
      <h2 id={`${id}-heading`} className="text-lg font-semibold text-ink">
        {section.label}
      </h2>
      <p className="mb-4 mt-0.5 text-sm text-secondary">{section.blurb}</p>
      <Card className="p-5 sm:p-6">{children}</Card>
    </section>
  )
}

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

      <Field id="linkedIn" label="LinkedIn profile" hint="Optional" error={errors.linkedIn}>
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
  positions,
}: {
  value: PositionState
  onChange: (next: PositionState) => void
  errors: Record<string, string>
  positions: string[]
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
          {positions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="yearsExperience"
        label="Total years of experience"
        required
        error={errors.yearsExperience}
      >
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

      <Field
        id="relevantExperience"
        label="Years of relevant experience"
        required
        hint="Time spent doing work directly relevant to this role"
        error={errors.relevantExperience}
      >
        <Input
          id="relevantExperience"
          type="number"
          min={0}
          max={60}
          step={0.5}
          inputMode="decimal"
          value={value.relevantExperience}
          onChange={set('relevantExperience')}
          invalid={!!errors.relevantExperience}
          aria-describedby={
            errors.relevantExperience ? 'relevantExperience-error' : 'relevantExperience-hint'
          }
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
    ['Total experience', position.yearsExperience ? `${position.yearsExperience} years` : ''],
    [
      'Relevant experience',
      position.relevantExperience ? `${position.relevantExperience} years` : '',
    ],
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
        Thank you for applying. Our team will review your application and be in touch if there is
        a match.
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
