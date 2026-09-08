import type { Candidate, NoteEntry, StatusHistoryEntry } from './graph/candidates'
import type { CandidateStatus } from './constants'

/**
 * The shape of a candidate as it reaches a client component.
 *
 * `Candidate` carries the SharePoint list item id and its ETag. Neither is
 * useful to the browser and §12 forbids exposing internal identifiers, so this
 * projection drops them. Every client component takes `CandidateView`, never
 * `Candidate`.
 */

export type CandidateView = {
  candidateId: string
  fullName: string
  email: string
  phone: string
  location: string
  linkedIn: string
  position: string
  yearsExperience: number
  currentCompany: string
  currentJobTitle: string
  currentCTC: string
  expectedCTC: string
  noticePeriod: string
  applicationDate: string
  status: CandidateStatus
  hasResume: boolean
  hasVideo: boolean
  notes: NoteEntry[]
  statusHistory: StatusHistoryEntry[]
}

export function toView(candidate: Candidate): CandidateView {
  return {
    candidateId: candidate.candidateId,
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    location: candidate.location,
    linkedIn: candidate.linkedIn,
    position: candidate.position,
    yearsExperience: candidate.yearsExperience,
    currentCompany: candidate.currentCompany,
    currentJobTitle: candidate.currentJobTitle,
    currentCTC: candidate.currentCTC,
    expectedCTC: candidate.expectedCTC,
    noticePeriod: candidate.noticePeriod,
    applicationDate: candidate.applicationDate,
    status: candidate.status,
    // Presence only — the SharePoint webUrl itself never reaches the browser.
    // Documents are opened through /api/recruiter/documents/… instead (§10.2).
    hasResume: !!candidate.resumeUrl,
    hasVideo: !!candidate.videoUrl,
    notes: candidate.notes,
    statusHistory: candidate.statusHistory,
  }
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
