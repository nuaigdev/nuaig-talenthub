'use client'

import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Field, Input, Select, Spinner, Textarea } from '@/components/ui'
import { SectionNav } from './SectionNav'
import { FileUploadField, type UploadState } from './FileUploadField'
import {
  APPLY_SECTIONS,
  CONSENT_TEXT,
  HIGHEST_QUALIFICATIONS,
  HOME_CITY,
  LOCATION_CHOICES,
  NOTICE_PERIODS,
  VIDEO_INSTRUCTIONS,
  YES_NO,
  type ApplySectionId,
} from '@/lib/constants'
import { detailsSchema, fieldErrors } from '@/lib/validation'

/**
 * The candidate application (spec.md §9), as one scrolling page.
 *
 * A single form with a section rail that tracks scroll position — a deliberate
 * departure from §6.1's step indicator, because the form is short enough that
 * gating it behind Continue clicks cost more than it helped.
 *
 * Several questions only appear once they become relevant: the city box and
 * relocation question when the candidate is not in the home city, employer
 * details when they say they are employed. Asking everything unconditionally
 * makes a form feel twice as long as it is.
 */

export type UploadLimits = {
  maxResumeBytes: number
  maxVideoBytes: number
  resumeTypes: string[]
  videoTypes: string[]
}

/** Every text-ish field, held as a string because that is what inputs produce. */
type FormState = {
  fullName: string
  email: string
  phone: string
  linkedIn: string
  position: string
  yearsExperience: string
  relevantExperience: string
  currentlyEmployed: string
  currentCompany: string
  currentJobTitle: string
  currentCTC: string
  variableComponent: string
  expectedCTC: string
  ctcNegotiable: string
  noticePeriod: string
  noticePeriodNegotiable: string
  highestQualification: string
  undergraduateCollege: string
  undergraduateCGPA: string
  postgraduateCollege: string
  postgraduateCGPA: string
  certifications: string
  agencyCode: string
  willingToRelocate: string
}

const EMPTY_FORM: FormState = {
  fullName: '',
  email: '',
  phone: '',
  linkedIn: '',
  position: '',
  yearsExperience: '',
  relevantExperience: '',
  currentlyEmployed: '',
  currentCompany: '',
  currentJobTitle: '',
  currentCTC: '',
  variableComponent: '',
  expectedCTC: '',
  ctcNegotiable: '',
  noticePeriod: '',
  noticePeriodNegotiable: '',
  highestQualification: '',
  undergraduateCollege: '',
  undergraduateCGPA: '',
  postgraduateCollege: '',
  postgraduateCGPA: '',
  certifications: '',
  agencyCode: '',
  willingToRelocate: '',
}

/**
 * Which fields belong to which section, so a validation error highlights the
 * right rail entry — including cross-field errors, which land on the field the
 * rule names rather than wherever the rule was declared.
 */
const SECTION_FIELDS: Record<ApplySectionId, Array<keyof FormState | 'location'>> = {
  personal: ['fullName', 'email', 'phone', 'location', 'willingToRelocate', 'linkedIn'],
  position: [
    'position',
    'yearsExperience',
    'relevantExperience',
    'currentlyEmployed',
    'currentCompany',
    'currentJobTitle',
    'currentCTC',
    'variableComponent',
    'expectedCTC',
    'ctcNegotiable',
    'noticePeriod',
    'noticePeriodNegotiable',
  ],
  education: [
    'highestQualification',
    'undergraduateCollege',
    'undergraduateCGPA',
    'postgraduateCollege',
    'postgraduateCGPA',
    'certifications',
  ],
  resume: [],
  video: [],
  consent: ['agencyCode'],
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
  const [form, setForm] = useState(EMPTY_FORM)
  const [locationChoice, setLocationChoice] = useState('')
  const [otherCity, setOtherCity] = useState('')
  const [resume, setResume] = useState<UploadState>({ phase: 'empty' })
  const [video, setVideo] = useState<UploadState>({ phase: 'empty' })
  const [consent, setConsent] = useState(false)
  const [draftToken, setDraftToken] = useState<string | undefined>()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<{ candidateId: string; emailSent: boolean } | null>(null)
  const [active, setActive] = useState<ApplySectionId>('personal')

  const inHomeCity = locationChoice === HOME_CITY
  const location = inHomeCity ? HOME_CITY : otherCity

  const details = {
    ...form,
    location,
    // Blank rather than a stale answer if they switch back to the home city.
    willingToRelocate: inHomeCity ? '' : form.willingToRelocate,
    currentCompany: form.currentlyEmployed === 'Yes' ? form.currentCompany : '',
    currentJobTitle: form.currentlyEmployed === 'Yes' ? form.currentJobTitle : '',
    yearsExperience: form.yearsExperience === '' ? Number.NaN : Number(form.yearsExperience),
    relevantExperience:
      form.relevantExperience === '' ? Number.NaN : Number(form.relevantExperience),
  }

  const parsed = detailsSchema.safeParse(details)
  const liveErrors = parsed.success ? {} : fieldErrors(parsed.error)

  const complete: Record<ApplySectionId, boolean> = {
    personal: sectionClean('personal', liveErrors) && !!location,
    position: sectionClean('position', liveErrors),
    education: sectionClean('education', liveErrors),
    resume: resume.phase === 'done',
    video: video.phase === 'done',
    consent,
  }

  // --- scroll spy ---------------------------------------------------------
  // A plain scroll listener rather than IntersectionObserver: the rule is "the
  // last section whose top has crossed the line", which states directly and
  // reads awkwardly as a set of intersection ratios.
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

  const set = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  async function submit() {
    // Show every problem at once and send the candidate to the first one,
    // rather than letting them press Submit repeatedly to discover them.
    setErrors(liveErrors)

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
          ...details,
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
          One page, six short sections. Your uploads start as soon as you choose a file, so
          nothing is waiting on you at the end.
        </p>
      </header>

      <div className="gap-10 lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div className="sticky top-16 z-30 -mx-4 mb-6 border-b border-border bg-bg px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:m-0 lg:border-0 lg:bg-transparent lg:p-0">
          <SectionNav active={active} complete={complete} onJump={jumpTo} />
        </div>

        <div className="min-w-0 space-y-8">
          <FormSection id="personal">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="fullName" label="Full name" required error={errors.fullName}>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) => set('fullName')(e.target.value)}
                    autoComplete="name"
                    invalid={!!errors.fullName}
                  />
                </Field>
              </div>

              <Field id="email" label="Email" required error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email')(e.target.value)}
                  autoComplete="email"
                  invalid={!!errors.email}
                />
              </Field>

              <Field id="phone" label="Phone" required error={errors.phone}>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone')(e.target.value)}
                  autoComplete="tel"
                  invalid={!!errors.phone}
                />
              </Field>

              <Field id="locationChoice" label="Current location" required error={errors.location}>
                <Select
                  id="locationChoice"
                  value={locationChoice}
                  onChange={(e) => setLocationChoice(e.target.value)}
                  invalid={!!errors.location}
                >
                  <option value="">Select your location</option>
                  {LOCATION_CHOICES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>

              {locationChoice === 'Other' && (
                <Field id="otherCity" label="Which city?" required error={errors.location}>
                  <Input
                    id="otherCity"
                    value={otherCity}
                    onChange={(e) => setOtherCity(e.target.value)}
                    placeholder="e.g. Bengaluru"
                    invalid={!!errors.location}
                  />
                </Field>
              )}

              {locationChoice === 'Other' && (
                <YesNoField
                  id="willingToRelocate"
                  label={`Are you ready to relocate to ${HOME_CITY}?`}
                  value={form.willingToRelocate}
                  onChange={set('willingToRelocate')}
                  error={errors.willingToRelocate}
                />
              )}

              <div className="sm:col-span-2">
                <Field id="linkedIn" label="LinkedIn profile" required error={errors.linkedIn}>
                  <Input
                    id="linkedIn"
                    type="url"
                    placeholder="https://linkedin.com/in/…"
                    value={form.linkedIn}
                    onChange={(e) => set('linkedIn')(e.target.value)}
                    invalid={!!errors.linkedIn}
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          <FormSection id="position">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="position" label="Position applying for" required error={errors.position}>
                <Select
                  id="position"
                  value={form.position}
                  onChange={(e) => set('position')(e.target.value)}
                  invalid={!!errors.position}
                >
                  <option value="">Select a position</option>
                  {positions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="hidden sm:block" aria-hidden="true" />

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
                  value={form.yearsExperience}
                  onChange={(e) => set('yearsExperience')(e.target.value)}
                  invalid={!!errors.yearsExperience}
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
                  value={form.relevantExperience}
                  onChange={(e) => set('relevantExperience')(e.target.value)}
                  invalid={!!errors.relevantExperience}
                />
              </Field>

              <YesNoField
                id="currentlyEmployed"
                label="Are you currently employed?"
                value={form.currentlyEmployed}
                onChange={set('currentlyEmployed')}
                error={errors.currentlyEmployed}
              />

              <div className="hidden sm:block" aria-hidden="true" />

              {form.currentlyEmployed === 'Yes' && (
                <>
                  <Field
                    id="currentCompany"
                    label="Current organisation"
                    required
                    error={errors.currentCompany}
                  >
                    <Input
                      id="currentCompany"
                      value={form.currentCompany}
                      onChange={(e) => set('currentCompany')(e.target.value)}
                      invalid={!!errors.currentCompany}
                    />
                  </Field>

                  <Field
                    id="currentJobTitle"
                    label="Current job title"
                    required
                    error={errors.currentJobTitle}
                  >
                    <Input
                      id="currentJobTitle"
                      value={form.currentJobTitle}
                      onChange={(e) => set('currentJobTitle')(e.target.value)}
                      invalid={!!errors.currentJobTitle}
                    />
                  </Field>
                </>
              )}

              <Field
                id="currentCTC"
                label="Current CTC"
                required
                hint="Include the currency"
                error={errors.currentCTC}
              >
                <Input
                  id="currentCTC"
                  value={form.currentCTC}
                  onChange={(e) => set('currentCTC')(e.target.value)}
                  invalid={!!errors.currentCTC}
                />
              </Field>

              <Field
                id="variableComponent"
                label="Variable component"
                hint="Optional — bonus or variable pay within your current CTC"
              >
                <Input
                  id="variableComponent"
                  value={form.variableComponent}
                  onChange={(e) => set('variableComponent')(e.target.value)}
                />
              </Field>

              <Field
                id="expectedCTC"
                label="Expected CTC"
                required
                hint="Include the currency"
                error={errors.expectedCTC}
              >
                <Input
                  id="expectedCTC"
                  value={form.expectedCTC}
                  onChange={(e) => set('expectedCTC')(e.target.value)}
                  invalid={!!errors.expectedCTC}
                />
              </Field>

              <YesNoField
                id="ctcNegotiable"
                label="Is your expected CTC negotiable?"
                value={form.ctcNegotiable}
                onChange={set('ctcNegotiable')}
                error={errors.ctcNegotiable}
              />

              <Field id="noticePeriod" label="Notice period" required error={errors.noticePeriod}>
                <Select
                  id="noticePeriod"
                  value={form.noticePeriod}
                  onChange={(e) => set('noticePeriod')(e.target.value)}
                  invalid={!!errors.noticePeriod}
                >
                  <option value="">Select a notice period</option>
                  {NOTICE_PERIODS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>

              <YesNoField
                id="noticePeriodNegotiable"
                label="Is your notice period negotiable?"
                value={form.noticePeriodNegotiable}
                onChange={set('noticePeriodNegotiable')}
                error={errors.noticePeriodNegotiable}
              />
            </div>
          </FormSection>

          <FormSection id="education">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="highestQualification"
                label="Highest qualification"
                required
                error={errors.highestQualification}
              >
                <Select
                  id="highestQualification"
                  value={form.highestQualification}
                  onChange={(e) => set('highestQualification')(e.target.value)}
                  invalid={!!errors.highestQualification}
                >
                  <option value="">Select your highest qualification</option>
                  {HIGHEST_QUALIFICATIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="hidden sm:block" aria-hidden="true" />

              <Field
                id="undergraduateCollege"
                label="Undergraduate college"
                required
                error={errors.undergraduateCollege}
              >
                <Input
                  id="undergraduateCollege"
                  value={form.undergraduateCollege}
                  onChange={(e) => set('undergraduateCollege')(e.target.value)}
                  invalid={!!errors.undergraduateCollege}
                />
              </Field>

              <Field
                id="undergraduateCGPA"
                label="Undergraduate CGPA"
                required
                hint="CGPA or percentage — whichever your college used"
                error={errors.undergraduateCGPA}
              >
                <Input
                  id="undergraduateCGPA"
                  value={form.undergraduateCGPA}
                  onChange={(e) => set('undergraduateCGPA')(e.target.value)}
                  placeholder="e.g. 8.4 or 82%"
                  invalid={!!errors.undergraduateCGPA}
                />
              </Field>

              <Field id="postgraduateCollege" label="Postgraduate college" hint="Optional">
                <Input
                  id="postgraduateCollege"
                  value={form.postgraduateCollege}
                  onChange={(e) => set('postgraduateCollege')(e.target.value)}
                />
              </Field>

              <Field id="postgraduateCGPA" label="Postgraduate CGPA" hint="Optional">
                <Input
                  id="postgraduateCGPA"
                  value={form.postgraduateCGPA}
                  onChange={(e) => set('postgraduateCGPA')(e.target.value)}
                  placeholder="e.g. 9.1 or 88%"
                />
              </Field>

              <div className="sm:col-span-2">
                <Field
                  id="certifications"
                  label="Relevant certifications"
                  hint="Optional — one per line"
                >
                  <Textarea
                    id="certifications"
                    value={form.certifications}
                    onChange={(e) => set('certifications')(e.target.value)}
                    maxLength={1000}
                    placeholder="e.g. AWS Certified Solutions Architect"
                  />
                </Field>
              </div>
            </div>
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
            <div className="space-y-6">
              <Field
                id="agencyCode"
                label="Agency code"
                hint="Optional — only if a recruitment agency referred you"
              >
                <Input
                  id="agencyCode"
                  value={form.agencyCode}
                  onChange={(e) => set('agencyCode')(e.target.value)}
                  className="sm:max-w-xs"
                />
              </Field>

              <ReviewTable form={form} location={location} resume={resume} video={video} />

              <label className="flex cursor-pointer items-start gap-3 rounded-md bg-surface p-4 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#069BDF]"
                />
                <span className="text-ink">{CONSENT_TEXT}</span>
              </label>
            </div>
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

function sectionClean(id: ApplySectionId, errors: Record<string, string>): boolean {
  return !SECTION_FIELDS[id].some((field) => errors[field])
}

/**
 * One section of the form. `scroll-mt` clears the sticky header and the mobile
 * section rail, so a jump lands with the heading visible rather than tucked
 * underneath them.
 */
function FormSection({ id, children }: { id: ApplySectionId; children: React.ReactNode }) {
  const section = APPLY_SECTIONS.find((entry) => entry.id === id)!

  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-40 lg:scroll-mt-24">
      <h2 id={`${id}-heading`} className="text-lg font-semibold text-ink">
        {section.label}
      </h2>
      <p className="mb-4 mt-0.5 text-sm text-secondary">{section.blurb}</p>
      <Card className="p-5 sm:p-6">{children}</Card>
    </section>
  )
}

function YesNoField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  error?: string
}) {
  return (
    <Field id={id} label={label} required error={error}>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        invalid={!!error}
      >
        <option value="">Select</option>
        {YES_NO.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </Field>
  )
}

function ReviewTable({
  form,
  location,
  resume,
  video,
}: {
  form: FormState
  location: string
  resume: UploadState
  video: UploadState
}) {
  const rows: Array<[string, string]> = [
    ['Name', form.fullName],
    ['Email', form.email],
    ['Phone', form.phone],
    ['Location', location],
    ...(location && location !== HOME_CITY
      ? ([[`Relocate to ${HOME_CITY}`, form.willingToRelocate]] as Array<[string, string]>)
      : []),
    ['Position', form.position],
    ['Total experience', form.yearsExperience ? `${form.yearsExperience} years` : ''],
    ['Relevant experience', form.relevantExperience ? `${form.relevantExperience} years` : ''],
    ['Currently employed', form.currentlyEmployed],
    ...(form.currentlyEmployed === 'Yes'
      ? ([
          ['Current organisation', form.currentCompany],
          ['Current job title', form.currentJobTitle],
        ] as Array<[string, string]>)
      : []),
    ['Current CTC', form.currentCTC],
    ['Variable component', form.variableComponent],
    ['Expected CTC', form.expectedCTC],
    ['Expected CTC negotiable', form.ctcNegotiable],
    ['Notice period', form.noticePeriod],
    ['Notice period negotiable', form.noticePeriodNegotiable],
    ['Highest qualification', form.highestQualification],
    ['Undergraduate college', form.undergraduateCollege],
    ['Undergraduate CGPA', form.undergraduateCGPA],
    ['Postgraduate college', form.postgraduateCollege],
    ['Postgraduate CGPA', form.postgraduateCGPA],
    ['Certifications', form.certifications],
    ['Agency code', form.agencyCode],
    ['Resume', resume.phase === 'done' ? resume.originalName : ''],
    ['Introduction video', video.phase === 'done' ? video.originalName : ''],
  ]

  return (
    <dl className="divide-y divide-border rounded-md border border-border">
      {rows
        .filter(([, value]) => value && value.trim().length > 0)
        .map(([label, value]) => (
          <div key={label} className="grid grid-cols-3 gap-3 px-4 py-2.5 text-sm">
            <dt className="text-secondary">{label}</dt>
            <dd className="col-span-2 whitespace-pre-wrap break-words font-medium text-ink">
              {value}
            </dd>
          </div>
        ))}
    </dl>
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
