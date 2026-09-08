# TalentHub — Recruitment Application Specification

> Internal repo name: `talenthub`. This name is never shown in the product UI.

## 1. Purpose

A production-ready recruitment application with two experiences:

1. **Public Candidate Application Portal** — no Microsoft account required, anyone with the URL can apply, uploads resume + intro video.
2. **Private Recruiter Dashboard** — Entra ID–authenticated, recruiters review candidates, documents, and manage status/notes.

Microsoft 365 / SharePoint Online is the system of record for both candidate documents and candidate data. No parallel database.

---

## 2. Architecture Overview

```
Candidate Browser                    Recruiter Browser
      │                                     │
      │ (no auth)                           │ (Entra ID SSO)
      ▼                                     ▼
┌─────────────────────────────────────────────────┐
│         Next.js App (Vercel)                     │
│  ┌───────────────┐        ┌───────────────────┐ │
│  │ Public routes  │        │ /recruiter routes  │ │
│  │ /apply/*        │        │ (middleware-gated) │ │
│  └───────┬───────┘        └─────────┬─────────┘ │
│          │  Server Actions / Route Handlers       │
│          ▼                                         │
│  ┌─────────────────────────────────────────────┐ │
│  │  Graph Service Layer (server-only)            │ │
│  │  - App-only auth (client credentials)         │ │
│  │  - Upload session orchestration                │ │
│  │  - List CRUD w/ ETag concurrency                │ │
│  └─────────────────────┬───────────────────────┘ │
└────────────────────────┼─────────────────────────┘
                          ▼
              Microsoft Graph API
                          ▼
              SharePoint Online
        (Document Library + Candidates List)
```

**Two distinct Graph auth modes, used deliberately:**

- **App-only (client credentials, daemon flow)** — used for all candidate-submission operations (folder creation, file upload, list item creation). The public portal has no user identity to act as, so the backend acts as the app itself with least-privilege `Sites.Selected` permission scoped only to the Recruitment site.
- **Delegated (Entra ID user auth via SSO)** — used for the recruiter dashboard. Recruiters sign in with their own Microsoft identity; the backend exchanges that for a Graph token to read/update the list acting *as that recruiter* where practical (falls back to app-only for the actual write, with the recruiter's identity captured in the audit trail — see §7.4). This keeps Graph credentials and tokens entirely server-side in both cases.

**Critical rule carried through every layer:** the candidate browser never talks to Microsoft Graph or SharePoint directly except for the raw file bytes of large uploads (§4), and even then only to a short-lived, single-purpose upload URL that grants no other capability.

---

## 3. Resolved Design Decisions

These decisions were made deliberately and should not be re-litigated by the implementer without flagging it back:

| # | Topic | Decision |
|---|---|---|
| 1 | Duplicate submissions | Block on **email + position match within a 90-day window**. Same person can re-apply for a different role anytime, or the same role after 90 days. Check happens server-side before folder/list creation. |
| 2 | Recruiter authorization | **Entra ID SSO for authentication** (who they are) + a **SharePoint "Recruiters" list for authorization** (are they allowed in). No Entra security group dependency — an admin manages the Recruiters list directly in SharePoint, no IT ticket needed to onboard/offboard a recruiter. |
| 3 | Large file uploads on Vercel | Vercel serverless functions have body-size and execution-time limits that make proxying a 500MB video through them wrong. Instead: backend creates a Graph **upload session** and returns only the session's `uploadUrl` to the browser; the **browser PUTs file chunks directly to that Microsoft-hosted URL**, never through the Vercel function. Vercel only handles small JSON calls (create session, report completion). This sidesteps Vercel limits entirely and is the correct pattern regardless of host. |
| 4 | File size limits | Resume: **10 MB** max. Video: **500 MB** max. Configurable via env vars, these are the defaults. |
| 5 | Candidate ID collisions | **Zero collision risk required** — a random-suffix-with-retry is only near-zero, not zero, so it's rejected. Instead: an **atomic counter SharePoint list item per year** (e.g. one hidden item `Counter-2026`), incremented via Graph's ETag-based optimistic concurrency (`If-Match` header) with retry-on-409. This guarantees a truly unique, gapless-enough sequential ID: `NUAIG-2026-00001`, `NUAIG-2026-00002`, etc. Contention risk is negligible at this application's volume, and the retry loop handles it if it ever happens. |
| 6 | Notifications | Lowest-hassle option that still notifies the candidate: **candidate receives a confirmation email only**, sent via Graph `sendMail` from a shared/service mailbox, containing their Candidate ID. No recruiter notification system in v1 — recruiters check the dashboard. (Hook left for adding recruiter notifications later — see §11.) |
| 7 | Dashboard scale | **Server-side pagination** using Graph's `$top` / `@odata.nextLink` against the SharePoint list. Filters (position, status, date) and search are applied server-side, not fetch-all-then-filter. |
| 8 | Accessibility | **Solid baseline, not a formal audit**: semantic HTML, labeled form fields, full keyboard navigation, visible focus states, sufficient color contrast, ARIA labels on icon-only controls. No WCAG AA compliance testing/checklist in v1. |
| 9 | Concurrent recruiter edits | **Nothing is ever overwritten or lost.** Recruiter Notes are **append-only entries** (author, timestamp, text) rendered as a chronological log — two recruiters typing notes at the same time both land as separate entries, never overwriting each other. Status changes are tracked the same way: every status change is appended to a **status history log** (who, when, from→to); the current status shown on the record is simply the latest entry. If two recruiters change status at nearly the same instant, both changes are recorded in history and the later timestamp wins as "current" — nothing is silently erased and the full history is always visible on the candidate detail page. |

---

## 4. Technology Stack

- Next.js 14+ (App Router), TypeScript, React
- Tailwind CSS
- Microsoft Graph SDK (`@microsoft/microsoft-graph-client`) for server-side Graph calls
- Auth: `next-auth` (Microsoft Entra ID provider) or MSAL Node for the recruiter side — implementer's choice, document whichever is used in SETUP.md
- Deployment target: **Vercel** (frontend + API routes/server actions)
- No client-side SDK calls to Graph anywhere. All Graph interaction happens in server actions / route handlers or, for large-file bytes only, direct browser→Microsoft PUT against a pre-authorized upload session URL (§3, decision 3).

---

## 5. Color System & Visual Identity

Derived directly from the provided NuAIg logo assets and aligned with nuaig.ai's clean, minimal, data/AI-forward B2B aesthetic. **Light mode only** — no dark mode toggle, no dark mode support needed.

### 5.1 Brand colors (from logo)

| Token | Hex | Usage |
|---|---|---|
| `--color-brand` | `#069BDF` | Primary actions, links, active nav state, focus rings, progress bars, chart accents |
| `--color-brand-hover` | `#0587C4` | Hover/active state of brand-colored buttons (≈10% darker) |
| `--color-brand-subtle` | `#E6F5FC` | Light tinted backgrounds — selected rows, info banners, badge backgrounds |
| `--color-ink` | `#111111` | Primary text, wordmark, headings |

### 5.2 Neutrals (light mode surface system)

| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#FFFFFF` | Page background |
| `--color-surface` | `#F7F9FB` | Card/section backgrounds, header background |
| `--color-surface-raised` | `#FFFFFF` | Cards sitting on `--color-surface` (with shadow) |
| `--color-border` | `#E5E9EF` | Dividers, input borders, table borders |
| `--color-border-strong` | `#D3D9E0` | Hover state on borders, focus outlines fallback |
| `--color-text-secondary` | `#5B6472` | Helper text, labels, table meta |
| `--color-text-muted` | `#8A93A1` | Placeholder text, disabled states |

### 5.3 Semantic / status colors

Used for the candidate status pipeline. Chosen to be distinguishable at a glance and consistent with a light, professional palette (no neon, no dark-mode-only colors):

| Status | Color token | Hex |
|---|---|---|
| New | Neutral blue | `#069BDF` (brand) |
| Screening | Slate | `#6B7280` |
| Shortlisted | Indigo | `#6366F1` |
| Interview | Amber | `#D97706` |
| Selected | Teal | `#0D9488` |
| Offer | Violet | `#7C3AED` |
| Joined | Green | `#16A34A` |
| Rejected | Red | `#DC2626` |
| On Hold | Gray | `#9CA3AF` |

Each renders as a small pill/badge: tinted background at ~12% opacity of the hex + full-opacity text/dot of the same hex, consistent with the `--color-brand-subtle` pattern above.

### 5.4 Typography

- Font: **Inter** (or system UI stack as fallback) — matches the clean sans-serif used across nuaig.ai.
- Headings: semibold/bold, `--color-ink`.
- Body: regular, `--color-ink` at full opacity for primary content, `--color-text-secondary` for supporting copy.
- Generous line-height (1.5–1.6) and letter-spacing at default — avoid cramped, "admin template" density.

### 5.5 Logo usage

- `logo.svg` (black wordmark + blue accent glyphs) — used in the header on the light `--color-surface` background, in both the public application and recruiter dashboard.
- `logo-white.svg` (white wordmark + blue accent glyphs) — reserved for any dark/blue-tinted surface if one is later introduced (e.g. a brand-colored banner or footer strip). Not needed anywhere in v1 since the entire UI is light, but ship it in `/public/brand/` for future use.
- Never stretch, recolor, or add effects to the logo. Maintain clear space around it equal to the height of the "N" glyph.
- The logo links to the application's home (public: application landing page; recruiter: dashboard).

### 5.6 Overall design language

- Clean, minimal, generous whitespace — mirror nuaig.ai, not a generic Bootstrap/admin-template feel.
- Cards with soft shadows (`shadow-sm`), rounded corners (`rounded-lg`, ~8–10px), subtle 1px borders using `--color-border`.
- Buttons: solid brand-blue primary, outlined/ghost secondary, clear disabled states, generous padding, rounded (`rounded-md`).
- No heavy drop shadows, no gradients except a very subtle one if used behind the hero section of the public application landing page.
- Motion: subtle, fast (150–200ms) transitions on hover/focus only — no decorative animation.

---

## 6. Navigation

**No sidebar anywhere in the application.** All navigation lives in a persistent header.

### 6.1 Public application header
- Left: logo (links to application start).
- Right: nothing functional needed — optionally a subtle "Having trouble? Contact us" mailto link.
- Sticky, thin, `--color-surface` background, bottom border.
- Below the header: a horizontal step indicator (Step 1 of 5 → Personal Info → Position → Resume → Video → Consent) instead of any side navigation.

### 6.2 Recruiter dashboard header
- Left: logo (links to `/recruiter` dashboard home).
- Center/left-of-center: horizontal nav links — **Dashboard**, **Candidates** (if separated from the main dashboard table), leave room for a future **Reports** link.
- Right: global search (optional quick-jump to a candidate by name/ID), then a user menu (recruiter's name/avatar from Entra profile, dropdown with "Sign out").
- Sticky header, `--color-surface` background, bottom border, consistent height with the public header for brand consistency.
- Active nav item underlined/colored in `--color-brand`.
- All filtering (position, status, date, search) lives as a filter bar directly under the header on the Candidates table view — not as a side panel.

---

## 7. Data Model

### 7.1 SharePoint Document Library structure

```
Recruitment/
  Candidates/
    2026/
      NUAIG-2026-00001 - Amit Sharma/
        Resume.pdf
        Introduction.mp4
```

- Year folder generated dynamically from the submission date.
- Candidate folder name: `{CandidateID} - {SanitizedFullName}`.
- Filenames are **always normalized** to `Resume.{ext}` and `Introduction.{ext}` — the candidate's original filename is never trusted or used for storage, only shown back to them in the UI during upload preview.
- Sanitization: strip/replace any character outside `[A-Za-z0-9 ,.'-]`, collapse whitespace, hard length cap (~100 chars) on the folder name before the extension.

### 7.2 SharePoint List: `Candidates`

| Column | Type | Notes |
|---|---|---|
| CandidateID | Single line text | e.g. `NUAIG-2026-00001`, unique, generated per §3 decision 5 |
| FullName | Single line text | |
| Email | Single line text | |
| Phone | Single line text | |
| Location | Single line text | |
| LinkedIn | Hyperlink | optional |
| Position | Choice | matches the 8 position options |
| YearsExperience | Number | |
| CurrentCompany | Single line text | optional |
| CurrentJobTitle | Single line text | optional |
| CurrentCTC | Single line text | optional (free text — currency varies) |
| ExpectedCTC | Single line text | optional |
| NoticePeriod | Choice | matches the notice period options |
| ResumeURL | Hyperlink | Graph `webUrl` of the uploaded resume |
| VideoURL | Hyperlink | Graph `webUrl` of the uploaded video |
| ApplicationDate | Date and Time | |
| Status | Choice | New / Screening / Shortlisted / Interview / Selected / Offer / Joined / Rejected / On Hold |
| RecruiterNotesJSON | Multiple lines of text (plain) | JSON array of `{author, authorEmail, timestamp, text}` — append-only, see §3 decision 9 |
| StatusHistoryJSON | Multiple lines of text (plain) | JSON array of `{author, authorEmail, timestamp, fromStatus, toStatus}` — append-only |
| ItemETag | (system) | used for optimistic concurrency on every update |

### 7.3 SharePoint List: `CandidateCounters` (internal, not shown to candidates or recruiters)

| Column | Type | Notes |
|---|---|---|
| Title / Year | Single line text | e.g. `2026` |
| CurrentValue | Number | Last issued sequence number for that year |

One item per year, created lazily on first submission of a new year. Incremented via Graph `PATCH` with `If-Match: {etag}`; on `412 Precondition Failed` (someone else incremented concurrently), re-fetch and retry up to N times.

### 7.4 SharePoint List: `Recruiters` (authorization)

| Column | Type | Notes |
|---|---|---|
| Email | Single line text | Recruiter's Entra ID UPN/email — checked against the signed-in user's token claim on every `/recruiter` request |
| DisplayName | Single line text | |
| Active | Yes/No | Deactivate access without deleting the row |

An admin manages this list directly in SharePoint — no app deployment or Entra group change needed to onboard/offboard a recruiter, per §3 decision 2.

---

## 8. Candidate ID Generation (implementation detail)

1. Determine current year (server-side, dynamic).
2. Fetch/create `CandidateCounters` item for that year.
3. `PATCH` `CurrentValue = CurrentValue + 1` with `If-Match` on the item's current ETag.
4. On success: format as `NUAIG-{YYYY}-{value zero-padded to 5 digits}`.
5. On `412`: refetch the item's latest ETag and value, retry (cap at 5 attempts, then fail the submission with a generic error and log the contention server-side).

This guarantees true uniqueness — no existence-check-and-hope, no UUID that breaks the requested format.

---

## 9. Application Flow (public candidate)

**Step 1 — Personal Information:** Full Name*, Email*, Phone*, City/Location*, LinkedIn (optional).

**Step 2 — Position:** Position Applying For* (Data Lead, Data Engineer, Data Analyst, AI Engineer, Automation Lead, Automation Engineer, Business Analyst, Other), Years of Experience*, Current Company, Current Job Title, Current CTC, Expected CTC, Notice Period* (Immediate, 15/30/45/60/90 days, Other).

**Step 3 — Resume:** PDF/DOC/DOCX, ≤10MB, client-side type/size validation before upload, upload progress bar, clear error states (wrong type, too large, upload failed with retry).

**Step 4 — Introduction Video:** MP4/MOV, ≤500MB, prominent instructional copy:
> "Please upload a 2–4 minute introduction video. Tell us your name, current role, key experience and why you're interested in this position."

Uploaded via the direct-to-Microsoft resumable session (§3 decision 3): chunked, progress bar reflects real byte progress, file is never fully buffered in browser memory (streamed via `Blob.slice` + `fetch` per chunk), automatic retry of the failed chunk (not the whole file) on transient network errors, with a manual "Retry upload" affordance if retries are exhausted.

**Step 5 — Consent:** Required checkbox — "I consent to my information and submitted documents being used for recruitment purposes and stored by the company." Submit disabled until checked.

**Submit → backend sequence:**
1. Server-side validation of every field (never trust client validation alone).
2. Duplicate check (email + position, 90-day window) → reject with a clear, friendly message if duplicate.
3. Generate Candidate ID (§8).
4. Create SharePoint candidate folder (sanitized name).
5. Move/confirm uploaded Resume and Video into that folder (or finalize the upload session there directly).
6. Create `Candidates` list item with all fields + file `webUrl`s.
7. Send candidate confirmation email via Graph `sendMail` with their Candidate ID.
8. Return success + Candidate ID to the browser (e.g. `NUAIG-2026-00481`), never any SharePoint URL or internal ID.

**Partial-failure handling:**
- Resume succeeds, video fails → do not show a success screen. Keep the candidate on Step 4 with a clear retry path; the resume already uploaded is reused, not re-uploaded.
- List item creation fails after both files uploaded → attempt cleanup of the orphaned folder/files server-side; if cleanup itself fails, log it clearly (`ORPHANED_FILES` error category with the folder path) for manual admin follow-up, and still show the candidate a generic failure message asking them to retry.

---

## 10. Recruiter Dashboard

### 10.1 `/recruiter` — Dashboard home
- Summary tiles: Total Candidates, New, Screening, Shortlisted, Interview, Selected, Joined, Rejected.
- Candidate table: Candidate ID, Name, Position, Experience, Expected CTC, Notice Period, Application Date, Status.
- Filter bar directly under the header (not a sidebar): Search, Position filter, Status filter, Date range filter, Sort (Newest, Experience).
- Server-side pagination (§3 decision 7) — page size ~25, `Load more` or numbered pagination, filters/search/sort all passed as query params to the server action which builds the appropriate Graph `$filter`/`$orderby`/`$skiptoken` request.

### 10.2 `/recruiter/candidates/[id]` — Candidate detail
- Header block: Name, Candidate ID, Position, Application Date.
- Contact & role details: contact info, experience, current company/title/CTC, expected CTC, notice period, LinkedIn.
- Documents: **View Resume** / **Watch Video** — clicking generates a short-lived, server-issued secure link to the SharePoint file (via Graph, never a raw persistent public SharePoint URL) and opens it. Documents are never publicly accessible.
- Status: dropdown to change status; every change appends to `StatusHistoryJSON` (§3 decision 9) and updates `Status` via ETag-guarded `PATCH`. Full status history visible in a small timeline under the dropdown.
- Recruiter Notes: append-only note composer + chronological list of all notes with author + timestamp (§3 decision 9). "Save Note" appends, never overwrites.

---

## 11. Future AI Hooks (not implemented now)

Design the data model and service layer so these can be added later without restructuring:

- `ResumeExtraction` — a service interface stub (`extractResumeData(fileUrl): Promise<ResumeData>`) not wired to anything yet.
- `VideoTranscription` — stub interface (`transcribeVideo(fileUrl): Promise<Transcript>`).
- `CandidateSummary` — stub combining resume + video + job description into a recruiter-facing summary.
- `RoleMatchScore` — stub numeric score interface, with a placeholder (nullable) `MatchScore` column reserved (but unused) on the `Candidates` list.
- A `RecruiterNotifications` hook point (referenced in §3 decision 6) — the `sendMail` service should be written generically enough that adding a recruiter-facing notification later is a one-line call, not a redesign.

Do not build any of the above now — just leave clean seams (interfaces, one reserved nullable column) so a future pass can slot AI in.

---

## 12. Security Requirements

- Entra ID authentication for recruiters; every `/recruiter/*` route/server action re-validates the session server-side and checks the signed-in email against the `Recruiters` SharePoint list (Active = Yes) before any Graph call.
- App-only Graph credentials (`MICROSOFT_CLIENT_SECRET`) never reach the browser, ever — not in props, not in client bundles, not in source maps.
- Graph access tokens (either app-only or delegated) never sent to the browser except the single-purpose, time-limited upload-session URL described in §3 decision 3, which grants only "append bytes to this specific upload session" and nothing else.
- All uploaded files: extension allow-list, MIME-type sniffing (not just extension trust), size limits (§3 decision 4) enforced server-side regardless of client-side checks.
- All form fields validated server-side regardless of client-side validation.
- Public submission endpoint is rate-limited (e.g. IP + email based) to blunt abuse.
- Duplicate protection per §3 decision 1.
- No public API exposes candidate records, SharePoint site/drive/list IDs, or any internal configuration.
- Recruiters cannot browse SharePoint directly — all document access is brokered through the app's server-side Graph calls.

---

## 13. Error Handling & Logging

- Candidate-facing errors are always generic and non-technical, e.g.:
  > "Your application could not be completed because of a temporary system issue. Please try again."
- Full technical detail (Graph error codes, HTTP status, correlation ID) logged server-side only, structured, including: Candidate ID (if generated), timestamp, operation, success/failure, error category.
- Never log: passwords, access tokens, client secrets, or any other sensitive auth material.
- Distinct error categories for observability: `VALIDATION_FAILED`, `DUPLICATE_SUBMISSION`, `UPLOAD_FAILED`, `GRAPH_UNAVAILABLE`, `LIST_ITEM_CREATE_FAILED`, `ORPHANED_FILES`, `AUTH_DENIED`, `RATE_LIMITED`.

---

## 14. Configuration

`.env.example` should include, at minimum:

```
# Entra ID / Microsoft Graph (app-only, client credentials)
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Entra ID (delegated, recruiter SSO — same app registration, different flow)
NEXTAUTH_URL=
NEXTAUTH_SECRET=

# SharePoint
SHAREPOINT_SITE_ID=
SHAREPOINT_DRIVE_ID=
SHAREPOINT_CANDIDATES_LIST_ID=
SHAREPOINT_COUNTERS_LIST_ID=
SHAREPOINT_RECRUITERS_LIST_ID=

# Mail
CONFIRMATION_MAILBOX_UPN=

# Upload limits
MAX_RESUME_SIZE_MB=10
MAX_VIDEO_SIZE_MB=500
ALLOWED_RESUME_TYPES=application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document
ALLOWED_VIDEO_TYPES=video/mp4,video/quicktime

# Duplicate protection
DUPLICATE_WINDOW_DAYS=90
```

No real secrets committed to source control.

---

## 15. Deliverables Checklist (for the implementer)

- [ ] Complete source code (Next.js app, server actions/route handlers, Graph service layer)
- [ ] `README.md`
- [ ] `SETUP.md` — Entra App Registration, redirect URLs, client secret creation, Graph permissions (least-privilege — `Sites.Selected` scoped to the Recruitment site, `Mail.Send` for the confirmation mailbox — not tenant-wide access), admin consent, identifying Site/Drive/List IDs, env var configuration, running locally, testing candidate submission, testing recruiter auth.
- [ ] `SHAREPOINT_SETUP.md` — creating the Recruitment site, document library, `Candidates` / `CandidateCounters` / `Recruiters` lists with exact columns from §7, permissions, folder structure, any required content types.
- [ ] `.env.example`
- [ ] Logo assets placed at `/public/brand/logo.svg` and `/public/brand/logo-white.svg`
- [ ] Public application flow (all 5 steps + success screen)
- [ ] Recruiter dashboard (`/recruiter`, `/recruiter/candidates/[id]`)
- [ ] Auth middleware for recruiter routes
- [ ] Validation, error handling, structured logging per §13
- [ ] Responsive, accessible (baseline) UI using the color system in §5, header-only navigation per §6
- [ ] Deployment recommendation write-up (Vercel frontend/API + rationale, noting the direct-to-Microsoft upload pattern that makes Vercel viable for large video files despite its function limits)
- [ ] Summary at the end: what was built, files created, env vars needed, Entra permissions required, SharePoint setup steps, how to run locally, how to test a full candidate submission end-to-end, recommended production architecture, and any remaining manual configuration.
