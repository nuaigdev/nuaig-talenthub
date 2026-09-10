# SharePoint setup

Everything the application stores lives in SharePoint Online. There is no
database, so this configuration *is* the schema. Work through it before running
the app — the columns below are referenced by exact internal name in
`src/lib/graph/candidates.ts`, and a mismatch fails at runtime, not at build.

Do this once per environment (dev / production). Using two separate sites is the
cleanest way to keep test applications out of the real pipeline.

---

## 1. Create the site

1. SharePoint admin centre → **Active sites** → **Create** → **Team site**.
2. Name it `Recruitment`. Note the URL, e.g.
   `https://contoso.sharepoint.com/sites/Recruitment`.
3. Keep it private. Nobody should browse this site directly — recruiters reach
   every document through the app, which brokers access with short-lived links.

---

## 2. Create the document library

1. In the site → **New** → **Document library** → name it `Candidates`.
2. Inside it, no folders need to be created by hand. The app creates:

   ```
   Candidates/                 ← the library
     _drafts/                  ← in-progress uploads, created automatically
       <uuid>/
     2026/                     ← year folder, created on first submission
       NUAIG-2026-00001 - Amit Sharma/
         Resume.pdf
         Introduction.mp4
   ```

   `_drafts` holds files that were uploaded but whose application was never
   submitted. Nothing reads from it after a successful submit. Sweeping folders
   older than a few days is a reasonable retention job to add later; the app
   does not do it for you.

> If you name the library something other than `Candidates`, set
> `SHAREPOINT_CANDIDATES_ROOT` to match, or leave the library at the drive root
> and point `SHAREPOINT_DRIVE_ID` at it.

---

## 3. Create the `Candidates` list

**New → List → Blank list**, named `Candidates`. Add these columns exactly. The
**internal name** is what matters — SharePoint derives it from the name you type
at creation, so create each column with the name in the first column below and
do not rename it afterwards (renaming changes the display name only, but a
column created with a different name keeps the original internal name forever).

| Column | Type | Notes |
|---|---|---|
| `CandidateID` | Single line of text | e.g. `NUAIG-2026-00001`. **Index this column.** |
| `FullName` | Single line of text | **Index this column.** |
| `Email` | Single line of text | Stored lower-cased. **Index this column.** |
| `Phone` | Single line of text | |
| `Location` | Single line of text | |
| `LinkedIn` | Single line of text | Optional. **Not** Hyperlink — see the note below. |
| `Position` | Single line of text | The role applied for. Options come from the `Positions` list (§6a), so this is text, not Choice. **Index this column.** **Never delete it** — the duplicate check and the dashboard filter both query it. |
| `YearsExperience` | Number | Total experience. Allow decimals |
| `RelevantExperience` | Number | Experience relevant to the role. Allow decimals |
| `WillingToRelocate` | Single line of text | `Yes`/`No`, blank when the candidate is already in the home city |
| `CurrentlyEmployed` | Single line of text | `Yes`/`No` |
| `CurrentCompany` | Single line of text | Only filled when currently employed |
| `CurrentJobTitle` | Single line of text | Only filled when currently employed |
| `HighestQualification` | Single line of text | |
| `UndergraduateCollege` | Single line of text | |
| `UndergraduateCGPA` | Single line of text | Text, not Number — see below |
| `PostgraduateCollege` | Single line of text | Optional |
| `PostgraduateCGPA` | Single line of text | Optional |
| `Certifications` | Multiple lines of text | **Plain text.** Optional |
| `VariableComponent` | Single line of text | Optional |
| `CTCNegotiable` | Single line of text | `Yes`/`No` |
| `NoticePeriodNegotiable` | Single line of text | `Yes`/`No` |
| `AgencyCode` | Single line of text | Optional, agency referrals only |
| `CurrentCTC` | Single line of text | Free text — currency varies |
| `ExpectedCTC` | Single line of text | Free text |
| `NoticePeriod` | Choice | The 7 options in §4 below |
| `ResumeURL` | Single line of text | Graph `webUrl` of the stored resume. **Not** Hyperlink. |
| `VideoURL` | Single line of text | Graph `webUrl` of the stored video. **Not** Hyperlink. |
| `ApplicationDate` | Date and time | Include time. **Index this column.** |
| `Status` | Single line of text | 15 values — see §4. Default `New`. **Index this column.** |
| `StatusRank` | Number | No decimals. Written by the app alongside `Status`; never edit by hand. It exists so the dashboard can sort by pipeline order — see below. **Index this column.** |
| `RecruiterNotesJSON` | Multiple lines of text | **Plain text**, not rich text. Append-only JSON array. |
| `StatusHistoryJSON` | Multiple lines of text | **Plain text**, not rich text. Append-only JSON array. |
| `MatchScore` | Number | Leave empty and unused. Reserved for a future AI pass (spec §11). |

### Why the three URL columns are text, not Hyperlink

`spec.md` §7.2 specifies Hyperlink for `LinkedIn`, `ResumeURL` and `VideoURL`.
Use **Single line of text** instead.

SharePoint's URL column type is not reliably writable through the Graph list
items API. Against a live tenant it rejected every value shape — a plain string,
`{Url, Description}`, `{url, description}`, `{Url}` alone — on both item create
and field patch, always with an unhelpful `400 invalidRequest: Invalid request`.
Graph also refuses to *create* such a column. A URL column therefore fails the
submission at the final step, after the files have already been uploaded.

Nothing is lost by using text. The stored value is the same `webUrl` string, and
nobody clicks it from inside SharePoint: recruiters open documents through the
app, which brokers a short-lived link (§10.2), and §12 requires that they cannot
browse the library directly.

The read path (`hyperlink()` in `src/lib/graph/candidates.ts`) still accepts
either a string or a `{Url}` object, so a real URL column would work if a future
Graph release makes it writable.

### Why the indexes matter

Graph refuses to `$filter` or `$orderby` a SharePoint list on a non-indexed
column once the list exceeds the list view threshold (5,000 items). The app
sends `Prefer: HonorNonIndexedQueriesWarningMayFailRandomly` so small lists work
without indexes, but that header is a stopgap — as the name says, it fails
randomly at scale.

Seven columns on `Candidates` are queried, and all seven should be indexed
before going live. No other list needs an index: `Positions`, `Recruiters` and
`Counters` are read whole and filtered in memory, and none of them will ever
approach the threshold.

| Column | Why |
| --- | --- |
| `CandidateID` | `eq` on every detail-page load; `startswith` from the search box |
| `Email` | `eq` for the duplicate check; `startswith` from the search box |
| `Position` | `eq` for the duplicate check and the position filter |
| `Status` | `eq` and `startswith` for the status filter |
| `StatusRank` | `orderby` for the status sort |
| `ApplicationDate` | `ge`/`le` for the date filters and the duplicate window; `orderby` for newest/oldest and as the status-sort tiebreak |
| `FullName` | `startswith` from the search box |

`YearsExperience` no longer needs one — it was only there for the "Most
experience" sort, which has been removed.

One honest caveat: an index helps `eq`, `ge`/`le` and `orderby` most.
`startswith` benefits least, so the search box is the first feature likely to
strain past the threshold, whatever is indexed.

To add an index: **List settings → Indexed columns → Create a new index**. The
index is built as you create it — there is nothing to run afterwards.

> **"Reindex List" is a different thing, and is not needed.** The option under
> *List settings → Advanced settings* queues a full recrawl by **SharePoint
> Search**, so list content shows up in SharePoint/Microsoft Search results. It
> has no bearing on column indexes. This app never touches the search index —
> every read is an OData `$filter`/`$orderby` against the list-items endpoint,
> which is served from the content database using exactly the column indexes
> above. Clicking Reindex List costs a full crawl and changes nothing here.

### The two JSON columns

`RecruiterNotesJSON` and `StatusHistoryJSON` must be **plain text**, not
enhanced rich text. Rich text injects HTML markup that breaks `JSON.parse`.

They hold arrays that are only ever appended to:

```jsonc
// RecruiterNotesJSON
[{ "author": "Priya N", "authorEmail": "priya@…", "timestamp": "2026-02-11T09:14:22.104Z", "text": "Strong SQL." }]

// StatusHistoryJSON
[{ "author": "System", "authorEmail": "", "timestamp": "…", "fromStatus": null, "toStatus": "New" }]
```

The app tolerates an empty or corrupt value (it renders as "no notes" rather
than erroring), but editing these by hand in the SharePoint UI will lose
history. Don't.

---

## 4. Choice column values

Type these exactly — they are compared as strings against `src/lib/constants.ts`.

`Position` is **not** in this list. It is a text column whose options come from
the `Positions` list (§6a), which recruiters manage themselves.

**`NoticePeriod`**
```
Immediate
15 days
30 days
45 days
60 days
90 days
Other
```

**`Status`** — the app writes these 15 values. Interview, Selected and Rejected
happen at a round, so they carry an `L1`/`L2`/`L3` suffix; the rest are single
points. Default to `New`.

```
New
Screening
Shortlisted
Interview L1
Interview L2
Interview L3
Selected L1
Selected L2
Selected L3
Offer
Joined
Rejected L1
Rejected L2
Rejected L3
On Hold
```

`NoticePeriod` is a Choice column — turn **off** "Can add values manually" so a
typo cannot create a value the app does not recognise.

`Status` is **Single line of text**, not Choice. The app owns that vocabulary
(stages × rounds, derived in one place in `src/lib/constants.ts`), and a text
column means adding a round later is a code change rather than a code change
*plus* a SharePoint edit in every environment. The app only ever writes one of
the 15 values above, and reads tolerate anything else by falling back to `New`.

### `StatusRank`

The dashboard offers a status sort that runs in pipeline order — New,
Screening, Shortlisted, Interview L1/L2/L3, Selected, Offer, Joined, then
Rejected and On Hold. OData cannot express "order by this list's sequence", and
ordering the `Status` text alphabetically would interleave the stages
meaninglessly and scatter the interview rounds. So the sequence is stored as a
number and ordered on directly.

The app writes it on create and on every status change, so it stays correct by
itself. `statusRank` in `src/lib/constants.ts` is the source of truth for the
values; nothing reads the column back, it exists purely to be sorted on.

> **Upgrading an existing site.** Rows that predate the column have no rank and
> would otherwise clump at one end of that sort. After adding the column, run
> the backfill once from the repo root:
>
> ```bash
> node scripts/backfill-status-rank.mjs           # dry run, writes nothing
> node scripts/backfill-status-rank.mjs --apply   # fill the ranks in
> ```
>
> It reads the same `.env.local` the app does, is safe to re-run, and reports
> any row it could not patch. Until it has run, the two status sort options are
> the only thing affected — every other filter and sort is unaffected.
>
> This has already been run against the live list (10 Sep 2026, 14 rows). It is
> kept for a rebuilt site or a restored backup, not because it is still pending.

> **Upgrading an existing site.** If `Status` is already a Choice column with the
> old 9 values, either change its type to Single line of text — SharePoint keeps
> the existing values — or add the six new levelled values to the Choice list.
> Existing records keep working either way: a stored `Interview` with no round
> still parses, and shows as the Interview stage.

---

## 5. Create the `CandidateCounters` list

**New → List → Blank list**, named `CandidateCounters`. This is internal
plumbing — no recruiter or candidate ever sees it.

| Column | Type | Notes |
|---|---|---|
| `Title` | Single line of text | The built-in Title column. Holds the year, e.g. `2026`. |
| `CurrentValue` | Number | Last issued sequence number. No decimals. |

Create **no items**. The app creates one row per year, lazily, on the first
submission of that year, and increments it under ETag optimistic concurrency to
guarantee unique candidate IDs.

Do not edit `CurrentValue` by hand while the app is live — you would hand two
candidates the same ID. If you must reset it (e.g. after clearing test data),
take the app offline first.

---

## 6a. Create the `Positions` list

**New → List → Blank list**, named `Positions`. This holds the roles candidates
can apply for. Recruiters manage it in the app at **/recruiter/positions**, so
you should not need to touch it again after creating it.

| Column | Type | Notes |
|---|---|---|
| `Title` | Single line of text | The built-in Title column. The position name, e.g. `AI Engineer`. |
| `Active` | Yes/No | Default **Yes**. No hides it from the application form. |
| `OwnerEmail` | Single line of text | Lower-cased email of the position's owner. Set automatically to the creator when a position is added in the app; an admin can (re)assign it. The owner is never removable from the hiring team. |
| `HiringManagersJSON` | Single line of text | A JSON array of lower-cased emails — the hiring team, **including the owner**. Membership of this array is what grants a recruiter access to the position's candidates. Managed in the app; do not hand-edit unless recovering a row. |

Seed it with your current roles, or add them from the dashboard once the app is
running.

**Access follows the hiring team.** A recruiter only sees the candidates for
positions whose `HiringManagersJSON` contains their email — on the dashboard,
the candidate list, the summary tiles, every candidate profile, and the document
broker, all enforced server-side. An **admin** (see §6) sees every position and
candidate. A position with no owner/managers (a legacy row, or `Other`) is
visible only to admins until a team is assigned.

This list is **optional**. Leave `SHAREPOINT_POSITIONS_LIST_ID` blank and the app
falls back to the built-in list in `src/lib/constants.ts` — the application form
still works, recruiters just cannot change the options. The same fallback
applies if the list is briefly unreachable, so a Graph blip never takes down the
public form.

**Close, don't delete.** Setting `Active = No` removes a position from the
application form while leaving it readable on the records of everyone who
already applied for it. Deleting the row leaves their history pointing at
something that no longer exists.

---

## 6. Create the `Recruiters` list

**New → List → Blank list**, named `Recruiters`. This is the authorization list:
membership here, not an Entra group, decides who can open the dashboard.

| Column | Type | Notes |
|---|---|---|
| `Email` | Single line of text | The recruiter's Entra UPN / sign-in address. Compared case-insensitively. |
| `DisplayName` | Single line of text | Shown in the header if Entra returns no name. |
| `Active` | Yes/No | Default **Yes**. Set to No to revoke access without deleting the row. |
| `Role` | Choice: `Recruiter`, `Admin` | Default **Recruiter**. A `Recruiter` sees only the positions they are a hiring manager on; an `Admin` sees every position and candidate, and can assign a position's owner. Read tolerantly — anything that is not `Admin` is treated as `Recruiter`. |

Add at least one row for yourself before testing sign-in, or you will
authenticate successfully and then be refused.

**Onboarding a recruiter:** add a row. **Offboarding:** set `Active` to No. No
deployment, no Entra change, no IT ticket. Access is re-checked on every
request, and the app caches the list for 60 seconds — so a change takes effect
within a minute.

---

## 7. Collect the IDs for `.env.local`

With the lists created, gather the five IDs. Graph Explorer
(<https://developer.microsoft.com/graph/graph-explorer>) is the easiest way —
sign in as an admin and run each query.

**Site ID** — `SHAREPOINT_SITE_ID`

```http
GET https://graph.microsoft.com/v1.0/sites/contoso.sharepoint.com:/sites/Recruitment
```

Use the full `id` value from the response. It is a three-part composite that
looks like `contoso.sharepoint.com,8f2c…,3a91…` — copy all of it, commas
included.

**Drive ID** — `SHAREPOINT_DRIVE_ID`

```http
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives
```

Pick the entry whose `name` is `Candidates` and copy its `id`.

**List IDs** — `SHAREPOINT_CANDIDATES_LIST_ID`, `SHAREPOINT_COUNTERS_LIST_ID`,
`SHAREPOINT_RECRUITERS_LIST_ID`

```http
GET https://graph.microsoft.com/v1.0/sites/{site-id}/lists
```

Match on `displayName` and copy each `id` (a GUID). `Positions` gives you
`SHAREPOINT_POSITIONS_LIST_ID`, which is optional — see §6a.

---

## 8. Site permissions

**This deployment uses `Sites.ReadWrite.All`, so there is nothing to do in this
section.** Admin consent on the app registration (SETUP.md §1) is sufficient on
its own — the app can reach every site in the tenant, this one included.

The rest of this section documents the least-privilege alternative the spec
originally called for. It is kept because reverting is cheap and worth doing
before go-live.

---

### Reverting to `Sites.Selected`

Swap the permission on the app registration — remove `Sites.ReadWrite.All`, add
`Sites.Selected`, grant admin consent — then bind the app to this site alone.
No application code changes either way.

The binding is what makes `Sites.Selected` work: the permission grants nothing
whatsoever until a site is explicitly named, which is precisely its value.

As a Global or SharePoint administrator, either run the PnP command:

```powershell
Connect-PnPOnline -Url "https://<tenant>.sharepoint.com/sites/Recruitment" -Interactive
Grant-PnPAzureADAppSitePermission -AppId "{MICROSOFT_CLIENT_ID}" `
  -DisplayName "TalentHub" `
  -Site "https://<tenant>.sharepoint.com/sites/Recruitment" `
  -Permissions Write
```

or the equivalent Graph call:

```http
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [
    { "application": { "id": "{MICROSOFT_CLIENT_ID}", "displayName": "TalentHub" } }
  ]
}
```

Verify it took:

```http
GET https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
```

`write` is the correct role — the app creates folders, uploads files, and
creates and updates list items. Do not grant `fullcontrol`.

---

## 9. Verify

A quick end-to-end check before wiring up the app:

1. `GET /sites/{site-id}/lists/{candidates-list-id}/items` returns an empty
   collection rather than a 403. A 401 means admin consent was never granted; a
   403 means it was granted against a different app id than the one in
   `.env.local`.
2. `GET /sites/{site-id}/drives/{drive-id}/root/children` returns the library
   root.
3. Submit a test application through the running app and confirm:
   - `CandidateCounters` gained a row for the current year with `CurrentValue` 1;
   - the library contains `Candidates/<year>/NUAIG-<year>-00001 - <name>/` with
     `Resume.*` and `Introduction.*` inside;
   - the `Candidates` list gained one item with `Status` = `New` and a
     one-entry `StatusHistoryJSON`.

---

## Retention and clean-up

Nothing in the app deletes candidate data. Two things are worth putting on a
schedule:

- **`_drafts`** — abandoned uploads accumulate. Delete folders older than a few
  days.
- **Candidate records** — whatever your data-retention policy requires. The
  consent text tells candidates their data is stored for recruitment purposes;
  honour the retention period you have committed to.
