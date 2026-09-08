# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TalentHub — a recruitment app with a public candidate portal (`/apply`, no auth) and a private recruiter dashboard (`/recruiter`, Entra ID SSO). `spec.md` is the authoritative specification and the source of every decision below; read it before non-trivial work. `README.md` covers architecture, `SETUP.md` the Entra/env setup, `SHAREPOINT_SETUP.md` the data schema.

The repo name `talenthub` and all SharePoint plumbing are internal — never surface them in product UI. Candidate-facing IDs use the `NUAIG-` prefix.

## Commands

```bash
npm run dev        # dev server on :3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

There is **no test suite**. `npm run typecheck` and `npm run build` are the only mechanical checks — run both before claiming something works. `SETUP.md` §6 is the manual end-to-end verification pass, including the failure cases that exercise the security guards.

The build succeeds without credentials (env access is lazy via getters in `src/lib/env.ts`), but `NEXTAUTH_SECRET` must be set even for a build, since it keys draft-upload tokens and pagination cursors.

To smoke-test pure server-side modules outside Next, Node's type stripping works but needs the server condition:
```bash
node --conditions=react-server --experimental-strip-types <script>.mjs
```

## Architecture: the load-bearing constraints

**SharePoint Online via Graph is the only datastore.** No database. Candidate records live in a SharePoint list, documents in a document library. Every persistence question resolves to "which Graph call".

**Two Graph auth modes, deliberately split.** App-only (client credentials) does everything the public portal needs, because there is no user to act as. Delegated Entra SSO identifies recruiters. Since the SharePoint grant is an *application* permission and §12 forbids recruiters reaching SharePoint directly, **all list reads and writes run app-only**, with the recruiter's identity captured in the append-only audit trail. Recruiter sign-in requests only `openid profile email`. Don't add delegated SharePoint scopes.

**Deployed with `Sites.ReadWrite.All`, not the spec's `Sites.Selected`.** A knowing deviation from spec.md §12, made by the tenant owner to avoid the per-site binding. It is a configuration choice only — no code depends on which of the two is granted, and reverting is a permission swap plus one PnP command (SHAREPOINT_SETUP.md §8). Treat it as reversible: never design anything that assumes tenant-wide reach.

**Large uploads never touch the server.** The browser PUTs 5 MiB chunks straight to a Graph upload-session URL (`src/lib/upload-client.ts`); Vercel functions only handle small JSON. That session URL is the single Graph-adjacent capability the browser ever receives. Do not "simplify" this into a server proxy — a 500MB video through a serverless function is exactly what spec §3 decision 3 rules out.

Because the candidate ID doesn't exist until submit, uploads land in `_drafts/<uuid>/` and are **moved** into the real candidate folder at submit (a metadata PATCH, so nothing re-uploads). Draft tokens are HMAC-signed because they become a path segment — see `verifyDraftToken` in `src/lib/graph/drive.ts`.

**Candidate IDs are guaranteed unique, not probably unique.** Random suffixes and UUIDs are explicitly rejected. `src/lib/graph/counters.ts` increments a per-year counter item under ETag optimistic concurrency, retrying on 412. Format `NUAIG-{YYYY}-{00001}`.

**Nothing is ever overwritten.** Notes and status changes are append-only JSON logs on the list item. `patchWithRetry` in `src/lib/graph/candidates.ts` re-reads and re-applies the mutation on 412 — that re-run is what makes concurrent notes additive rather than last-write-wins. Preserve that shape when adding writes.

**Queries are server-side.** Filter/search/sort/paginate inside the Graph request; never fetch-all-then-filter. The one documented exception is `countByStatus` for the summary tiles, which projects a single column and is capped.

**Cursors are encrypted.** A raw `@odata.nextLink` contains site and list IDs, which §12 forbids exposing, so `src/lib/cursor.ts` AES-GCM encrypts it into an opaque, tamper-evident token. Never put a nextLink in a URL or a client prop.

## Security invariants

- `src/lib/env.ts` and everything under `src/lib/graph/` import `server-only`. Keep it that way — it turns an accidental client import into a build error instead of a leaked secret.
- Client components take `CandidateView` (`src/lib/candidate-view.ts`), never `Candidate` — the latter carries the list item id and ETag.
- **Every server action re-authorizes** via `requireRecruiter()`. `src/middleware.ts` only checks for a session cookie to save a render; it is not the security boundary, and a server action is a public endpoint regardless of which layout rendered it.
- Uploads are validated three times: declared type/size at session creation, draft-folder ownership at submit, and magic-number sniffing of stored bytes at submit (`src/lib/file-signature.ts`). Extension trust alone is not acceptable.
- Documents are brokered through `/api/recruiter/documents/[candidateId]/[kind]`, which redirects to a short-lived Graph download URL. No SharePoint link is ever rendered into a page.

## Error handling and logging

`AppError` (`src/lib/errors.ts`) carries a generic `publicMessage` and a categorised technical detail. Route handlers serialise **only** `publicMessage`. The category must be one of: `VALIDATION_FAILED`, `DUPLICATE_SUBMISSION`, `UPLOAD_FAILED`, `GRAPH_UNAVAILABLE`, `LIST_ITEM_CREATE_FAILED`, `ORPHANED_FILES`, `AUTH_DENIED`, `RATE_LIMITED`.

`src/lib/logger.ts` emits one JSON line per event and redacts anything matching an auth-material key pattern at any depth. Never log tokens or secrets.

Partial-failure paths matter and are already implemented in `src/app/api/apply/submit/route.ts`: a failed video must not show a success screen or re-upload the resume; a failed list-item create rolls back and logs `ORPHANED_FILES` with the folder path if cleanup also fails. The confirmation email is deliberately allowed to fail without failing the submission.

## Design decisions not to re-litigate

`spec.md` §3 lists nine. Flag back rather than silently changing any. Beyond those above: duplicates block on **email + position within 90 days**; limits are resume 10MB / video 500MB (env-configurable); candidates get a confirmation email, recruiters get no notifications in v1; accessibility is a solid baseline, not a WCAG audit.

## UI conventions

- **Light mode only.** No dark variants, no `dark:` classes.
- **No sidebar anywhere.** Header-only navigation; step indicator on the public flow, filter bar under the header on the dashboard.
- Tokens live in `src/app/globals.css`, mapped in `tailwind.config.ts`. Brand `#069BDF`, ink `#111111`. Use tokens, not raw hex, except the status palette in `src/lib/constants.ts`.
- Status badges are ~12% tinted pills with full-opacity text and dot.
- Transitions 150–200ms on hover/focus only. `shadow-sm`, `rounded-lg` cards. Not an admin-template look.
- `public/brand/logo.svg` / `logo-white.svg` are the real supplied marks — never recolour, stretch or filter them. The white variant is unused in v1 and shipped for future use.
- Wide tables scroll inside their own container; the page body must never scroll horizontally.

## Future AI hooks

`src/lib/ai/index.ts` defines interfaces for resume extraction, transcription, summarisation and match scoring. **Nothing is implemented and nothing calls them.** The data-side reservation is the nullable `MatchScore` column, read into `Candidate.matchScore` and left null. Leave the seams; don't build them. `sendMail` is generic for the same reason.
