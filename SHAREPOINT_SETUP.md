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
| `CurrentCompany` | Single line of text | **Unused.** Removed from the form; the app no longer reads or writes it. Safe to leave or delete. |
| `CurrentJobTitle` | Single line of text | **Unused.** As above. |
| `CurrentCTC` | Single line of text | Free text — currency varies |
| `ExpectedCTC` | Single line of text | Free text |
| `NoticePeriod` | Choice | The 7 options in §4 below |
| `ResumeURL` | Single line of text | Graph `webUrl` of the stored resume. **Not** Hyperlink. |
| `VideoURL` | Single line of text | Graph `webUrl` of the stored video. **Not** Hyperlink. |
| `ApplicationDate` | Date and time | Include time. **Index this column.** |
| `Status` | Choice | The 9 options in §4 below. Default `New`. **Index this column.** |
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
randomly at scale. Index at least `CandidateID`, `Email`, `Position`, `Status`
and `ApplicationDate` before going live.

To add an index: **List settings → Indexed columns → Create a new index**.

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

**`Status`** — set the default to `New`.
```
New
Screening
Shortlisted
Interview
Selected
Offer
Joined
Rejected
On Hold
```

For both, turn **off** "Can add values manually" so a typo cannot create a
status the app does not recognise.

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

Seed it with your current roles, or add them from the dashboard once the app is
running.

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
