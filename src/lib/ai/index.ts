/**
 * Reserved seams for a later AI pass (spec.md §11).
 *
 * NOTHING HERE IS IMPLEMENTED, AND NOTHING CALLS IT. These interfaces exist so
 * that adding resume extraction, transcription, summarisation or match scoring
 * later is a matter of writing an implementation and wiring one call site —
 * not restructuring the data model or the service layer.
 *
 * The matching reservation on the data side is the nullable `MatchScore` column
 * on the Candidates list, which is created by SHAREPOINT_SETUP.md, read into
 * `Candidate.matchScore`, and left null by every current code path.
 */

export type ResumeData = {
  skills: string[]
  totalYearsExperience: number | null
  education: Array<{ institution: string; qualification: string; year: number | null }>
  employment: Array<{ company: string; title: string; from: string | null; to: string | null }>
}

export type Transcript = {
  text: string
  languageCode: string
  durationSeconds: number | null
}

export type CandidateSummaryInput = {
  candidateId: string
  resume?: ResumeData
  transcript?: Transcript
  jobDescription?: string
}

export type CandidateSummary = {
  headline: string
  strengths: string[]
  concerns: string[]
}

export type RoleMatch = {
  /** 0–100, or null when the inputs are insufficient to score. */
  score: number | null
  rationale: string
}

export interface ResumeExtraction {
  extractResumeData(fileUrl: string): Promise<ResumeData>
}

export interface VideoTranscription {
  transcribeVideo(fileUrl: string): Promise<Transcript>
}

export interface CandidateSummarizer {
  summarize(input: CandidateSummaryInput): Promise<CandidateSummary>
}

export interface RoleMatchScorer {
  score(input: CandidateSummaryInput): Promise<RoleMatch>
}

const NOT_IMPLEMENTED = 'AI services are not implemented in v1 (spec.md §11).'

/**
 * Placeholder bindings. Replacing these with real implementations is the whole
 * of the wiring work; every consumer would depend on the interfaces above.
 */
export const resumeExtraction: ResumeExtraction = {
  async extractResumeData() {
    throw new Error(NOT_IMPLEMENTED)
  },
}

export const videoTranscription: VideoTranscription = {
  async transcribeVideo() {
    throw new Error(NOT_IMPLEMENTED)
  },
}

export const candidateSummarizer: CandidateSummarizer = {
  async summarize() {
    throw new Error(NOT_IMPLEMENTED)
  },
}

export const roleMatchScorer: RoleMatchScorer = {
  async score() {
    throw new Error(NOT_IMPLEMENTED)
  },
}
