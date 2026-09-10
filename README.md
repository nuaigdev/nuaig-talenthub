# TalentHub

A recruitment application with two experiences:

- **Public candidate portal** (`/apply`) — no Microsoft account needed. Anyone
  with the URL can apply, uploading a resume and an introduction video.
- **Private recruiter dashboard** (`/recruiter`) — Entra ID SSO. Recruiters
  review candidates, open documents, change status and keep notes.

Microsoft 365 / SharePoint Online is the system of record for both documents and
candidate data. There is no parallel database.

> The repo name `talenthub` is internal and never appears in the product UI.

**Documentation:** [SETUP.md](./SETUP.md) (Entra app registration, env vars,
running, verifying) · [SHAREPOINT_SETUP.md](./SHAREPOINT_SETUP.md) (site,
library, lists, columns, permissions) · [spec.md](./spec.md) (the authoritative
specification) · [CLAUDE.md](./CLAUDE.md) (orientation for AI coding agents).

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill it in — see SETUP.md
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint` |

There is no automated test suite in this build. `npm run typecheck` and
`npm run build` are the mechanical checks; SETUP.md §6 is the manual
verification pass, including the failure cases that exercise the guards.

---

## Architecture

```
Candidate browser                         Recruiter browser
      │  (no auth)                              │  (Entra ID SSO)
      ▼                                         ▼
┌──────────────────────────────────────────────────────────┐
│  Next.js App Router (Vercel)                              │
│                                                            │
│  /apply/*                    /recruiter/*                  │
│  public, unauthenticated     requireRecruiter() gate       │
│         │                             │                    │
│         └───────────┬─────────────────┘                    │
│                     ▼                                      │
│         Graph service layer (server-only)                  │
│         app-only auth · upload sessions · ETag CRUD        │
└─────────────────────┬──────────────────────────────────────┘
                      ▼
              Microsoft Graph  →  SharePoint Online
                                  (library + 3 lists)

        ╌╌╌ large file bytes bypass the server entirely ╌╌╌
   browser ──PUT chunks──▶ Microsoft-hosted upload session URL
```

### Where things live

| Path | Responsibility |
|---|---|
| `src/lib/graph/client.ts` | Token acquisition + caching, both auth modes, Graph error wrapping |
| `src/lib/graph/counters.ts` | Atomic candidate-ID allocation |
| `src/lib/graph/drive.ts` | Folders, upload sessions, moves, short-lived download URLs |
| `src/lib/graph/candidates.ts` | Candidate list CRUD, filtered pagination, append-only writes |
| `src/lib/graph/recruiters.ts` | Authorization list lookup + cache |
| `src/lib/graph/mail.ts` | `sendMail`, and the candidate confirmation built on it |
| `src/lib/auth.ts` · `recruiter-session.ts` | Entra SSO; the per-request authorization gate |
| `src/lib/upload-client.ts` | Browser-side chunked upload (the only client-side Graph-adjacent code) |
| `src/app/api/apply/*` | Public endpoints: mint upload session, submit application |
| `src/app/recruiter/*` | Dashboard, candidate detail, server actions |

---

## The decisions that shape the code

These come from `spec.md` §3 and are load-bearing. Changing one is a design
decision, not a refactor.

**Large uploads never touch our server.** A 500 MB video through a serverless
function is wrong on Vercel and everywhere else. The backend creates a Graph
upload session and returns only its `uploadUrl`; the browser PUTs 5 MiB chunks
straight to Microsoft. Our functions handle small JSON only. That URL is the
sole Graph-adjacent capability the browser ever receives — short-lived, scoped
to one file, and unable to read anything.

Because the candidate ID does not exist until submit, uploads land in a
per-session `_drafts/<uuid>` folder and are **moved** into the real candidate
folder at submit time. A move is a metadata PATCH, so a successful upload is
never re-transferred — which is what makes "video failed, resume didn't" cheap
to retry.

**Candidate IDs are guaranteed unique, not probably unique.** A random suffix
with an existence check is near-zero collision risk, and near-zero was rejected.
Instead a per-year counter item is incremented under ETag optimistic
concurrency: read with ETag, `PATCH` with `If-Match`, retry on 412. Whoever wins
the race gets that number, and nobody can get it twice.

**Nothing is ever overwritten.** Recruiter notes and status changes are
append-only JSON logs on the list item. Two recruiters typing at once both land;
the current status is simply the newest history entry. Every write is
ETag-guarded and re-applies against freshly read state on conflict, so a lost
update becomes a retry rather than silent data loss.

**Authentication and authorization are separate.** Entra SSO establishes who a
recruiter is; a SharePoint `Recruiters` list decides whether they get in. An
admin onboards or offboards by editing a list row — no Entra group, no redeploy,
no IT ticket. Membership is re-checked on **every** request, not just at
sign-in.

**Queries are server-side.** Filtering, search, sort and pagination are built
into the Graph request. The dashboard never fetches everything and filters in
memory. The one exception is the summary-tile tally, which projects a single
column and is capped — noted in `countByStatus`.

**The candidate never sees a technical error.** Failures carry two messages: a
generic one for the user and a categorised technical one for the structured
server log (`VALIDATION_FAILED`, `DUPLICATE_SUBMISSION`, `UPLOAD_FAILED`,
`GRAPH_UNAVAILABLE`, `LIST_ITEM_CREATE_FAILED`, `ORPHANED_FILES`, `AUTH_DENIED`,
`RATE_LIMITED`). The logger redacts anything that looks like auth material at
any depth.

---

## Security posture

- Client secrets and Graph tokens never leave the server. `src/lib/env.ts` and
  the whole `graph/` layer import `server-only`, so an accidental client import
  is a build error rather than a leaked secret.
- Recruiters cannot browse SharePoint. Documents open via
  `/api/recruiter/documents/…`, which re-authorizes, then redirects to a
  short-lived pre-authenticated Graph URL. No SharePoint link is ever rendered
  into the page.
- No SharePoint site, drive or list ID reaches the browser. Pagination cursors
  would otherwise expose them, so they are AES-GCM encrypted into opaque tokens
  that are also tamper-evident.
- Uploads are checked three ways: declared type and size when the session is
  minted, ownership of the draft folder at submit, and **magic-number sniffing**
  of the stored bytes at submit. A `.exe` renamed to `.pdf` uploads fine and is
  rejected at submission.
- Every server action re-authorizes independently. Middleware only does a
  cookie-presence check to save a render — it is not the security boundary, and
  server actions are public endpoints regardless of which layout rendered them.
- The public submit endpoint is rate-limited by IP and email.

### Known limits, stated plainly

- **Rate limiting is per serverless instance.** It uses an in-memory map, so it
  blunts abuse rather than enforcing a global quota. The authoritative
  protection against repeat applications is the storage-backed 90-day duplicate
  check. Swap in Redis if a hard global limit is needed.
- **The summary tiles are capped** at 25 pages of 999 items. Past that they
  under-report rather than hang; the table stays exact.
- **`_drafts` is not swept.** Abandoned uploads accumulate until someone
  deletes them. See SHAREPOINT_SETUP.md.
- **Search is prefix matching**, not full-text — SharePoint list items have no
  `$search` through Graph.

---

## Design system

Light mode only — no dark variants anywhere. Tokens are defined once in
`src/app/globals.css` and mapped in `tailwind.config.ts`; brand blue is
`#069BDF`, ink `#111111`. Nine status colours render as pills tinted to ~12%
with full-opacity text and dot.

Navigation is header-only on the recruiter side, with filters in a bar directly
under the header rather than a side panel.

The public application is a single page with a left section rail that follows
scroll position. `spec.md` §6.1 specifies a five-step wizard with a horizontal
step indicator instead; that was changed deliberately, because the form is short
enough that gating it behind four "Continue" clicks cost more than it helped.
The rail is an overview, never a gate — every section is on the page from the
start, and its completion ticks reflect real validation state so a candidate can
see what is outstanding before pressing Submit.

The logo assets in `public/brand/` are the supplied NuAIg marks and are never
recoloured, stretched or filtered. `logo-white.svg` is shipped for a future
dark or brand-tinted surface; nothing in v1 uses it.

`public/og.png` is the link-preview card that WhatsApp, Teams, Slack and
LinkedIn render when someone shares `careers.nuaig.ai`. It is a pre-rendered
1200×630 PNG rather than a generated-on-request image or the brand SVG, for two
reasons: those crawlers ignore SVG previews entirely, and several of them give
up on a slow response, so a static file served straight from the CDN is the only
shape that reliably previews. `logo.svg` is composited into it at its native
aspect ratio and untouched colours. Regenerate it if the wording or the mark
changes — keep the dimensions, and keep it well under a few hundred KB.

Metadata lives in `src/lib/site.ts` and is declared on the root layout, so every
route inherits a preview. Note that Next merges metadata only one level deep: a
page that declares its own `openGraph` replaces the parent's wholesale, image
included, which is why `/apply` restates all of it. `/` 307s to `/apply`, and
preview crawlers follow redirects, so the shared apex link resolves to the same
card.

Accessibility is the spec's "solid baseline, not a formal audit": semantic HTML,
every field labelled, full keyboard navigation, visible focus rings, ARIA on
icon-only controls, live regions on async results, and wide tables that scroll
inside their own container so the page never scrolls sideways.

---

## Reserved for later

`src/lib/ai/index.ts` defines interfaces for resume extraction, video
transcription, candidate summarisation and role-match scoring. **None are
implemented and nothing calls them.** They exist so a future pass is an
implementation plus one call site, not a restructure. The matching reservation
on the data side is the nullable `MatchScore` column, which is created, read
into `Candidate.matchScore`, and left null everywhere.

`sendMail` is written generically for the same reason — adding recruiter
notifications is a call, not a redesign.
