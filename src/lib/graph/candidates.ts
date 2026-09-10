import 'server-only'
import type { Client } from '@microsoft/microsoft-graph-client'
import { appOnlyClient, isPreconditionFailed, wrapGraphError } from './client'
import { policyEnv, sharePointEnv } from '../env'
import { AppError } from '../errors'
import {
  DASHBOARD_PAGE_SIZE,
  parseStatus,
  stageTakesLevel,
  statusRank,
  type CandidateStatus,
  type NoticePeriod,
  type Position,
} from '../constants'

/**
 * The `Candidates` SharePoint list is the system of record (spec.md §7.2).
 * There is no parallel database, so every read and write below is a Graph call.
 *
 * Two invariants this module exists to protect:
 *   - Notes and status changes are append-only JSON logs. Nothing is ever
 *     overwritten, so two recruiters writing at once both land (§3 decision 9).
 *   - Every write is ETag-guarded. A lost update fails loudly and retries
 *     against fresh state rather than silently clobbering.
 */

export type NoteEntry = {
  author: string
  authorEmail: string
  timestamp: string
  text: string
}

export type StatusHistoryEntry = {
  author: string
  authorEmail: string
  timestamp: string
  fromStatus: CandidateStatus | null
  toStatus: CandidateStatus
}

export type Candidate = {
  /** SharePoint list item id — internal, never exposed to candidates. */
  itemId: string
  etag: string
  candidateId: string
  fullName: string
  email: string
  phone: string
  location: string
  linkedIn: string
  position: Position
  yearsExperience: number
  relevantExperience: number
  willingToRelocate: string
  currentlyEmployed: string
  currentCompany: string
  currentJobTitle: string
  highestQualification: string
  undergraduateCollege: string
  undergraduateCGPA: string
  postgraduateCollege: string
  postgraduateCGPA: string
  certifications: string
  variableComponent: string
  ctcNegotiable: string
  noticePeriodNegotiable: string
  agencyCode: string
  currentCTC: string
  expectedCTC: string
  noticePeriod: NoticePeriod
  resumeUrl: string
  videoUrl: string
  applicationDate: string
  status: CandidateStatus
  notes: NoteEntry[]
  statusHistory: StatusHistoryEntry[]
  /** Reserved for a future AI pass (spec.md §11); always null today. */
  matchScore: number | null
}

type HyperlinkField = { Url?: string; Description?: string } | string | null | undefined

type CandidateFields = Record<string, unknown> & {
  id?: string
  CandidateID?: string
  FullName?: string
  Email?: string
  Phone?: string
  Location?: string
  LinkedIn?: HyperlinkField
  Position?: string
  YearsExperience?: number
  RelevantExperience?: number
  WillingToRelocate?: string
  CurrentlyEmployed?: string
  CurrentCompany?: string
  CurrentJobTitle?: string
  HighestQualification?: string
  UndergraduateCollege?: string
  UndergraduateCGPA?: string
  PostgraduateCollege?: string
  PostgraduateCGPA?: string
  Certifications?: string
  VariableComponent?: string
  CTCNegotiable?: string
  NoticePeriodNegotiable?: string
  AgencyCode?: string
  CurrentCTC?: string
  ExpectedCTC?: string
  NoticePeriod?: string
  ResumeURL?: HyperlinkField
  VideoURL?: HyperlinkField
  ApplicationDate?: string
  Status?: string
  RecruiterNotesJSON?: string
  StatusHistoryJSON?: string
  MatchScore?: number | null
}

type ListItem = {
  id: string
  '@odata.etag'?: string
  fields: CandidateFields
}

const SELECTED_FIELDS = [
  'id',
  'CandidateID',
  'FullName',
  'Email',
  'Phone',
  'Location',
  'LinkedIn',
  'Position',
  'YearsExperience',
  'RelevantExperience',
  'WillingToRelocate',
  'CurrentlyEmployed',
  'CurrentCompany',
  'CurrentJobTitle',
  'HighestQualification',
  'UndergraduateCollege',
  'UndergraduateCGPA',
  'PostgraduateCollege',
  'PostgraduateCGPA',
  'Certifications',
  'VariableComponent',
  'CTCNegotiable',
  'NoticePeriodNegotiable',
  'AgencyCode',
  'CurrentCTC',
  'ExpectedCTC',
  'NoticePeriod',
  'ResumeURL',
  'VideoURL',
  'ApplicationDate',
  'Status',
  'RecruiterNotesJSON',
  'StatusHistoryJSON',
  'MatchScore',
].join(',')

/**
 * SharePoint's Graph surface will not `$filter`/`$orderby` a non-indexed column
 * without this. Index the columns listed in SHAREPOINT_SETUP.md and the header
 * becomes belt-and-braces rather than load-bearing.
 */
const NON_INDEXED = 'HonorNonIndexedQueriesWarningMayFailRandomly'

function itemsApi(suffix = ''): string {
  return `/sites/${sharePointEnv.siteId}/lists/${sharePointEnv.candidatesListId}/items${suffix}`
}

/** Escapes a value for an OData string literal. */
function odata(value: string): string {
  return value.replace(/'/g, "''")
}

function hyperlink(field: HyperlinkField): string {
  if (!field) return ''
  return typeof field === 'string' ? field : (field.Url ?? '')
}

/** Parses an append-only JSON log, tolerating a column that is empty or corrupt. */
function parseLog<T>(raw: string | undefined, sortKey: (entry: T) => string): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as T[]).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  } catch {
    // A hand-edit in the SharePoint UI must not take down the detail page.
    return []
  }
}

export function toCandidate(item: ListItem): Candidate {
  const fields = item.fields ?? {}
  return {
    itemId: item.id,
    etag: item['@odata.etag'] ?? '',
    candidateId: fields.CandidateID ?? '',
    fullName: fields.FullName ?? '',
    email: fields.Email ?? '',
    phone: fields.Phone ?? '',
    location: fields.Location ?? '',
    linkedIn: hyperlink(fields.LinkedIn),
    position: (fields.Position ?? 'Other') as Position,
    yearsExperience: Number(fields.YearsExperience ?? 0),
    relevantExperience: Number(fields.RelevantExperience ?? 0),
    willingToRelocate: fields.WillingToRelocate ?? '',
    currentlyEmployed: fields.CurrentlyEmployed ?? '',
    currentCompany: fields.CurrentCompany ?? '',
    currentJobTitle: fields.CurrentJobTitle ?? '',
    highestQualification: fields.HighestQualification ?? '',
    undergraduateCollege: fields.UndergraduateCollege ?? '',
    undergraduateCGPA: fields.UndergraduateCGPA ?? '',
    postgraduateCollege: fields.PostgraduateCollege ?? '',
    postgraduateCGPA: fields.PostgraduateCGPA ?? '',
    certifications: fields.Certifications ?? '',
    variableComponent: fields.VariableComponent ?? '',
    ctcNegotiable: fields.CTCNegotiable ?? '',
    noticePeriodNegotiable: fields.NoticePeriodNegotiable ?? '',
    agencyCode: fields.AgencyCode ?? '',
    currentCTC: fields.CurrentCTC ?? '',
    expectedCTC: fields.ExpectedCTC ?? '',
    noticePeriod: (fields.NoticePeriod ?? 'Other') as NoticePeriod,
    resumeUrl: hyperlink(fields.ResumeURL),
    videoUrl: hyperlink(fields.VideoURL),
    applicationDate: fields.ApplicationDate ?? '',
    status: (fields.Status ?? 'New') as CandidateStatus,
    notes: parseLog<NoteEntry>(fields.RecruiterNotesJSON, (entry) => entry.timestamp),
    statusHistory: parseLog<StatusHistoryEntry>(
      fields.StatusHistoryJSON,
      (entry) => entry.timestamp,
    ),
    matchScore: typeof fields.MatchScore === 'number' ? fields.MatchScore : null,
  }
}

// ---------------------------------------------------------------------------
// Duplicate protection (spec.md §3 decision 1)
// ---------------------------------------------------------------------------

/**
 * Blocks a re-application for the *same position* by the *same email* inside the
 * configured window. A different role is always allowed, and the same role
 * again once the window has passed.
 */
export async function findRecentDuplicate(
  email: string,
  position: Position,
  now: Date = new Date(),
): Promise<Candidate | null> {
  const cutoff = new Date(now.getTime() - policyEnv.duplicateWindowDays * 86_400_000)
  const client = appOnlyClient()

  try {
    const response = await client
      .api(itemsApi())
      .expand(`fields($select=${SELECTED_FIELDS})`)
      .filter(
        [
          `fields/Email eq '${odata(email.toLowerCase())}'`,
          `fields/Position eq '${odata(position)}'`,
          `fields/ApplicationDate ge '${cutoff.toISOString()}'`,
        ].join(' and '),
      )
      .header('Prefer', NON_INDEXED)
      .top(1)
      .get()

    const [item] = (response.value ?? []) as ListItem[]
    return item ? toCandidate(item) : null
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'duplicate check')
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type NewCandidate = {
  candidateId: string
  fullName: string
  email: string
  phone: string
  location: string
  linkedIn: string
  position: Position
  yearsExperience: number
  relevantExperience: number
  willingToRelocate: string
  currentlyEmployed: string
  currentCompany: string
  currentJobTitle: string
  highestQualification: string
  undergraduateCollege: string
  undergraduateCGPA: string
  postgraduateCollege: string
  postgraduateCGPA: string
  certifications: string
  variableComponent: string
  ctcNegotiable: string
  noticePeriodNegotiable: string
  agencyCode: string
  currentCTC: string
  expectedCTC: string
  noticePeriod: NoticePeriod
  resumeUrl: string
  videoUrl: string
  applicationDate: string
}

export async function createCandidate(input: NewCandidate): Promise<Candidate> {
  const client = appOnlyClient()

  const seededHistory: StatusHistoryEntry[] = [
    {
      author: 'System',
      authorEmail: '',
      timestamp: input.applicationDate,
      fromStatus: null,
      toStatus: 'New',
    },
  ]

  try {
    const item = (await client.api(itemsApi()).post({
      fields: {
        Title: input.candidateId,
        CandidateID: input.candidateId,
        FullName: input.fullName,
        // Stored lower-cased so the duplicate check is a plain equality match.
        Email: input.email.toLowerCase(),
        Phone: input.phone,
        Location: input.location,
        // These three are written as plain strings, not Hyperlink
        // `{Url, Description}` objects. SharePoint's URL column type is not
        // reliably writable through Graph — it rejects every value shape, on
        // both POST and PATCH — so the setup guide specifies plain text columns
        // and stores the webUrl as a string. `hyperlink()` on the read side
        // still accepts either shape, so a real URL column would also work.
        LinkedIn: input.linkedIn,
        Position: input.position,
        YearsExperience: input.yearsExperience,
        RelevantExperience: input.relevantExperience,
        WillingToRelocate: input.willingToRelocate,
        CurrentlyEmployed: input.currentlyEmployed,
        CurrentCompany: input.currentCompany,
        CurrentJobTitle: input.currentJobTitle,
        HighestQualification: input.highestQualification,
        UndergraduateCollege: input.undergraduateCollege,
        UndergraduateCGPA: input.undergraduateCGPA,
        PostgraduateCollege: input.postgraduateCollege,
        PostgraduateCGPA: input.postgraduateCGPA,
        Certifications: input.certifications,
        VariableComponent: input.variableComponent,
        CTCNegotiable: input.ctcNegotiable,
        NoticePeriodNegotiable: input.noticePeriodNegotiable,
        AgencyCode: input.agencyCode,
        CurrentCTC: input.currentCTC,
        ExpectedCTC: input.expectedCTC,
        NoticePeriod: input.noticePeriod,
        ResumeURL: input.resumeUrl,
        VideoURL: input.videoUrl,
        ApplicationDate: input.applicationDate,
        Status: 'New',
        StatusRank: statusRank('New'),
        RecruiterNotesJSON: '[]',
        StatusHistoryJSON: JSON.stringify(seededHistory),
      },
    })) as ListItem

    return toCandidate({ ...item, fields: { ...item.fields } })
  } catch (error) {
    throw wrapGraphError(error, 'LIST_ITEM_CREATE_FAILED', 'create candidate list item')
  }
}

export async function deleteCandidateItem(itemId: string): Promise<void> {
  const client = appOnlyClient()
  await client.api(itemsApi(`/${itemId}`)).delete()
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function getByFilter(filter: string, client: Client): Promise<Candidate | null> {
  const response = await client
    .api(itemsApi())
    .expand(`fields($select=${SELECTED_FIELDS})`)
    .filter(filter)
    .header('Prefer', NON_INDEXED)
    .top(1)
    .get()

  const [item] = (response.value ?? []) as ListItem[]
  return item ? toCandidate(item) : null
}

/** Looks a candidate up by their public `NUAIG-YYYY-NNNNN` id. */
export async function getCandidateByCandidateId(
  candidateId: string,
  client: Client = appOnlyClient(),
): Promise<Candidate | null> {
  try {
    return await getByFilter(`fields/CandidateID eq '${odata(candidateId)}'`, client)
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'read candidate')
  }
}

export type CandidateQuery = {
  search?: string
  position?: Position | 'all'
  /**
   * Zero or more statuses, OR-ed together. Empty means no status filter —
   * there is no 'all' sentinel, because an empty selection says the same thing.
   */
  statuses?: CandidateStatus[]
  from?: string
  to?: string
  sort?: 'newest' | 'oldest' | 'status' | 'status-desc'
  /** Opaque Graph `@odata.nextLink`, passed straight back to fetch page N+1. */
  cursor?: string
  pageSize?: number
}

export type CandidatePage = {
  items: Candidate[]
  nextCursor: string | null
}

function buildFilter(query: CandidateQuery): string | null {
  const clauses: string[] = []

  if (query.position && query.position !== 'all') {
    clauses.push(`fields/Position eq '${odata(query.position)}'`)
  }
  if (query.statuses?.length) {
    // A status is stored as "stage" or "stage L2". Filtering by a levelled
    // stage matches every round under it, which is what a recruiter means by
    // "show me everyone at interview". No stage name prefixes another, so a
    // prefix match cannot bleed across stages.
    const matches = query.statuses.map((status) =>
      stageTakesLevel(status)
        ? `startswith(fields/Status,'${odata(status)}')`
        : `fields/Status eq '${odata(status)}'`,
    )
    // Parenthesised: the clauses below are AND-ed, so an un-grouped `or` would
    // bind wrongly and quietly widen every other filter.
    clauses.push(matches.length === 1 ? matches[0] : `(${matches.join(' or ')})`)
  }
  if (query.from) {
    clauses.push(`fields/ApplicationDate ge '${new Date(query.from).toISOString()}'`)
  }
  if (query.to) {
    // Inclusive of the whole end day.
    const to = new Date(query.to)
    to.setUTCHours(23, 59, 59, 999)
    clauses.push(`fields/ApplicationDate le '${to.toISOString()}'`)
  }
  if (query.search) {
    const term = odata(query.search.trim())
    // SharePoint list items have no $search; prefix matching on the columns a
    // recruiter would actually type into the box is the closest equivalent.
    clauses.push(
      `(startswith(fields/FullName,'${term}') or startswith(fields/CandidateID,'${term}') or startswith(fields/Email,'${term}'))`,
    )
  }

  return clauses.length ? clauses.join(' and ') : null
}

function buildOrderBy(sort: CandidateQuery['sort']): string {
  switch (sort) {
    case 'oldest':
      return 'fields/ApplicationDate asc'
    // Pipeline order, not alphabetical — which is the whole reason `StatusRank`
    // is stored: OData cannot express "sort by this list's sequence", and
    // ordering the Status text would interleave the stages meaninglessly and
    // scatter Interview L1-L3. See `statusRank` in constants.ts.
    case 'status':
      return 'fields/StatusRank asc'
    case 'status-desc':
      return 'fields/StatusRank desc'
    default:
      return 'fields/ApplicationDate desc'
  }
}

/**
 * One page of candidates. Filtering, sorting and paging all happen inside the
 * Graph request — the dashboard never fetches everything and filters in memory
 * (spec.md §3 decision 7).
 */
export async function queryCandidates(query: CandidateQuery): Promise<CandidatePage> {
  const client = appOnlyClient()
  const pageSize = query.pageSize ?? DASHBOARD_PAGE_SIZE

  try {
    // A cursor already encodes filter/sort/skiptoken, so it is followed verbatim.
    const request = query.cursor
      ? client.api(query.cursor)
      : (() => {
          let req = client
            .api(itemsApi())
            .expand(`fields($select=${SELECTED_FIELDS})`)
            .orderby(buildOrderBy(query.sort))
            .top(pageSize)
          const filter = buildFilter(query)
          if (filter) req = req.filter(filter)
          return req
        })()

    const response = await request.header('Prefer', NON_INDEXED).get()

    return {
      items: ((response.value ?? []) as ListItem[]).map(toCandidate),
      nextCursor: (response['@odata.nextLink'] as string | undefined) ?? null,
    }
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'query candidates')
  }
}

/** Hard ceiling on the summary-tile tally, so one huge list can't stall a page. */
const COUNT_PAGE_SIZE = 999
const COUNT_MAX_PAGES = 25

/**
 * Tallies candidates per status for the dashboard tiles.
 *
 * This is the one place that reads the whole list, and it projects a single
 * column to keep the payload small. Graph's SharePoint surface has no reliable
 * filtered `$count`, and nine filtered round-trips would cost more than one
 * lightweight scan. It is capped; past the cap the tiles under-report rather
 * than hanging, and the table itself stays fully server-paginated.
 */
export async function countByStatus(): Promise<{
  counts: Record<string, number>
  total: number
  truncated: boolean
}> {
  const client = appOnlyClient()
  const counts: Record<string, number> = {}
  let total = 0
  let truncated = false

  try {
    let request = client
      .api(itemsApi())
      .expand('fields($select=Status)')
      .top(COUNT_PAGE_SIZE)
      .header('Prefer', NON_INDEXED)

    for (let page = 0; page < COUNT_MAX_PAGES; page += 1) {
      const response = await request.get()
      for (const item of (response.value ?? []) as ListItem[]) {
        // Tallied by stage, not by exact status: an "Interview" tile should
        // count L1, L2 and L3 together.
        const { stage } = parseStatus(item.fields?.Status ?? 'New')
        counts[stage] = (counts[stage] ?? 0) + 1
        total += 1
      }

      const next = response['@odata.nextLink'] as string | undefined
      if (!next) return { counts, total, truncated }
      request = client.api(next).header('Prefer', NON_INDEXED)
      truncated = page === COUNT_MAX_PAGES - 1
    }

    return { counts, total, truncated }
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'count candidates by status')
  }
}

// ---------------------------------------------------------------------------
// Append-only writes (spec.md §3 decision 9)
// ---------------------------------------------------------------------------

const WRITE_ATTEMPTS = 4

/**
 * Read-modify-write under `If-Match`, retrying on 412 against freshly read
 * state. `mutate` receives the current candidate and returns only the fields to
 * patch; because it re-runs on each attempt, an append composed inside it is
 * always applied on top of whatever the other recruiter just wrote — which is
 * what makes concurrent notes additive rather than last-write-wins.
 */
async function patchWithRetry(
  candidateId: string,
  operation: string,
  mutate: (current: Candidate) => Record<string, unknown>,
): Promise<Candidate> {
  const client = appOnlyClient()

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const current = await getCandidateByCandidateId(candidateId, client)
    if (!current) {
      throw new AppError('VALIDATION_FAILED', `Candidate not found: ${candidateId}`, {
        publicMessage: 'That candidate could not be found.',
        context: { candidateId },
      })
    }

    try {
      await client
        .api(itemsApi(`/${current.itemId}/fields`))
        .header('If-Match', current.etag)
        .patch(mutate(current))

      const updated = await getCandidateByCandidateId(candidateId, client)
      return updated ?? current
    } catch (error) {
      if (!isPreconditionFailed(error)) {
        throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', operation)
      }
      // Another recruiter wrote first. Re-read and re-apply on top of theirs.
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt))
    }
  }

  throw new AppError('GRAPH_UNAVAILABLE', `${operation} lost ${WRITE_ATTEMPTS} concurrency races`, {
    context: { candidateId },
  })
}

/** App field name → SharePoint column, for the fields a recruiter may correct. */
const EDITABLE_COLUMNS: Record<string, string> = {
  fullName: 'FullName',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  willingToRelocate: 'WillingToRelocate',
  linkedIn: 'LinkedIn',
  position: 'Position',
  yearsExperience: 'YearsExperience',
  relevantExperience: 'RelevantExperience',
  currentlyEmployed: 'CurrentlyEmployed',
  currentCompany: 'CurrentCompany',
  currentJobTitle: 'CurrentJobTitle',
  currentCTC: 'CurrentCTC',
  variableComponent: 'VariableComponent',
  expectedCTC: 'ExpectedCTC',
  ctcNegotiable: 'CTCNegotiable',
  noticePeriod: 'NoticePeriod',
  noticePeriodNegotiable: 'NoticePeriodNegotiable',
  highestQualification: 'HighestQualification',
  undergraduateCollege: 'UndergraduateCollege',
  undergraduateCGPA: 'UndergraduateCGPA',
  postgraduateCollege: 'PostgraduateCollege',
  postgraduateCGPA: 'PostgraduateCGPA',
  certifications: 'Certifications',
  agencyCode: 'AgencyCode',
}

/** Human labels for the edit note, so the audit trail reads like prose. */
const EDITABLE_LABELS: Record<string, string> = {
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  willingToRelocate: 'Willing to relocate',
  linkedIn: 'LinkedIn',
  position: 'Position',
  yearsExperience: 'Total experience',
  relevantExperience: 'Relevant experience',
  currentlyEmployed: 'Currently employed',
  currentCompany: 'Current organisation',
  currentJobTitle: 'Current job title',
  currentCTC: 'Current CTC',
  variableComponent: 'Variable component',
  expectedCTC: 'Expected CTC',
  ctcNegotiable: 'Expected CTC negotiable',
  noticePeriod: 'Notice period',
  noticePeriodNegotiable: 'Notice period negotiable',
  highestQualification: 'Highest qualification',
  undergraduateCollege: 'Undergraduate college',
  undergraduateCGPA: 'Undergraduate CGPA',
  postgraduateCollege: 'Postgraduate college',
  postgraduateCGPA: 'Postgraduate CGPA',
  certifications: 'Certifications',
  agencyCode: 'Agency code',
}

/**
 * Corrects a candidate's details on their behalf (a mistyped email, a wrong
 * CTC). Unlike notes and status, these fields *are* meant to be overwritten —
 * the point is to fix a mistake, not to accumulate versions.
 *
 * What is preserved instead is a record that the edit happened: every change is
 * appended to the recruiter notes as a system entry naming the fields and the
 * old values. That reuses the existing audit surface rather than adding a
 * column, and it shows up in the timeline a recruiter already reads.
 *
 * Only fields whose value actually differs are written, so an accidental save
 * with nothing changed is a no-op rather than a misleading audit entry.
 */
export async function updateCandidateDetails(
  candidateId: string,
  input: Record<string, string | number>,
  author: { name: string; email: string },
): Promise<{ candidate: Candidate; changed: string[] }> {
  let changed: string[] = []

  const candidate = await patchWithRetry(candidateId, 'update candidate details', (current) => {
    const record = current as unknown as Record<string, string | number>
    const patch: Record<string, unknown> = {}
    const summaries: string[] = []
    changed = []

    for (const [field, column] of Object.entries(EDITABLE_COLUMNS)) {
      if (!(field in input)) continue

      const next = input[field]
      const previous = record[field]
      if (String(previous ?? '') === String(next ?? '')) continue

      patch[column] = next
      changed.push(field)
      const label = EDITABLE_LABELS[field] ?? field
      summaries.push(`${label}: "${previous ?? ''}" → "${next ?? ''}"`)
    }

    if (!changed.length) return {}

    const entry: NoteEntry = {
      author: author.name,
      authorEmail: author.email,
      timestamp: new Date().toISOString(),
      text: `Details corrected by ${author.name}:\n${summaries.join('\n')}`,
    }
    patch.RecruiterNotesJSON = JSON.stringify([...current.notes, entry])

    return patch
  })

  return { candidate, changed }
}

export async function appendNote(
  candidateId: string,
  note: Omit<NoteEntry, 'timestamp'>,
): Promise<Candidate> {
  return patchWithRetry(candidateId, 'append recruiter note', (current) => {
    const entry: NoteEntry = { ...note, timestamp: new Date().toISOString() }
    return { RecruiterNotesJSON: JSON.stringify([...current.notes, entry]) }
  })
}

/**
 * Appends a status change to the history log and moves `Status` to the new
 * value. The current status is simply the latest history entry, so simultaneous
 * changes both survive in history and the later timestamp reads as current.
 */
export async function changeStatus(
  candidateId: string,
  toStatus: CandidateStatus,
  author: { name: string; email: string },
): Promise<Candidate> {
  return patchWithRetry(candidateId, 'change candidate status', (current) => {
    const entry: StatusHistoryEntry = {
      author: author.name,
      authorEmail: author.email,
      timestamp: new Date().toISOString(),
      fromStatus: current.status,
      toStatus,
    }
    return {
      Status: toStatus,
      // Kept in lockstep with Status — it is derived, and the only reason it is
      // stored at all is that Graph can only order by a column that exists.
      StatusRank: statusRank(toStatus),
      StatusHistoryJSON: JSON.stringify([...current.statusHistory, entry]),
    }
  })
}
