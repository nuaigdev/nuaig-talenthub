# Setup

Getting TalentHub running, from a fresh clone to a verified end-to-end
submission. Do [SHAREPOINT_SETUP.md](./SHAREPOINT_SETUP.md) either before or
alongside this — you need IDs from it to fill in `.env.local`.

**Auth library:** this implementation uses **Auth.js / NextAuth v5**
(`next-auth@5` beta) with the built-in `microsoft-entra-id` provider, rather
than MSAL Node. The spec left this to the implementer; NextAuth was chosen
because it handles the App Router session plumbing, cookie security and CSRF
protection that MSAL Node would leave to us to write by hand.

---

## 1. Entra ID app registration

One app registration serves both auth modes — app-only for candidate
submissions, delegated SSO for recruiters.

### Create it

1. Entra admin centre → **App registrations** → **New registration**.
2. Name: `TalentHub`.
3. Supported account types: **Accounts in this organizational directory only**.
4. Redirect URI: **Web** → `http://localhost:3000/api/auth/callback/microsoft-entra-id`
5. Register, then copy from the Overview page:
   - **Application (client) ID** → `MICROSOFT_CLIENT_ID`
   - **Directory (tenant) ID** → `MICROSOFT_TENANT_ID`

### Add production redirect URIs

Under **Authentication**, add one per environment you deploy:

```
https://<your-domain>/api/auth/callback/microsoft-entra-id
https://<project>.vercel.app/api/auth/callback/microsoft-entra-id
```

Vercel preview deployments get a new URL per deployment, which Entra cannot
wildcard. Either add specific preview URLs as needed, or set a stable preview
domain and use that. Recruiter sign-in will fail on any URL not listed here.

### Client secret

**Certificates & secrets → New client secret.** Copy the **Value** (not the
Secret ID) immediately — it is shown once. That is `MICROSOFT_CLIENT_SECRET`.

Set an expiry you will actually track. When it expires, recruiter sign-in and
every candidate submission stop working at the same moment.

### API permissions — least privilege

**API permissions → Add a permission → Microsoft Graph.**

**Application permissions** (used by the app-only flow):

| Permission | Why |
|---|---|
| `Sites.Selected` | Read/write the Recruitment site *only*. Grants nothing until bound to that specific site — see SHAREPOINT_SETUP.md §8. |
| `Mail.Send` | Send the candidate confirmation email. |

**Delegated permissions** (used by recruiter SSO):

| Permission | Why |
|---|---|
| `openid`, `profile`, `email` | Establish who the recruiter is. Nothing more is requested. |

Then **Grant admin consent** for the tenant.

Two things to be deliberate about:

- **Do not** add `Sites.ReadWrite.All`. That is tenant-wide access to every
  SharePoint site, and it is exactly what `Sites.Selected` exists to avoid.
- `Mail.Send` as an application permission allows sending as *any* mailbox by
  default. Restrict it to the confirmation mailbox with an Exchange application
  access policy:

  ```powershell
  # Exchange Online PowerShell
  New-DistributionGroup -Name "TalentHub Mail Senders" -Type Security `
    -Members "careers@contoso.com"

  New-ApplicationAccessPolicy -AppId "<MICROSOFT_CLIENT_ID>" `
    -PolicyScopeGroupId "TalentHub Mail Senders" `
    -AccessRight RestrictAccess `
    -Description "TalentHub may send only as the careers mailbox"

  Test-ApplicationAccessPolicy -Identity "careers@contoso.com" -AppId "<MICROSOFT_CLIENT_ID>"
  ```

  Policy changes take up to 30 minutes to propagate.

---

## 2. Confirmation mailbox

Create or choose a shared mailbox for outbound confirmations, e.g.
`careers@contoso.com`. Its UPN is `CONFIRMATION_MAILBOX_UPN`. It needs no
licence beyond what a shared mailbox normally requires.

---

## 3. Local configuration

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Generate the secret with:

```bash
openssl rand -base64 32
```

`NEXTAUTH_SECRET` does more than sign session cookies here — it also keys the
HMAC on draft-upload tokens and the AES-GCM encryption on pagination cursors. It
must be set even in development, and changing it invalidates in-flight uploads
and open dashboard pages (both recover on retry).

The five `SHAREPOINT_*` IDs come from SHAREPOINT_SETUP.md §7.

---

## 4. Run

```bash
npm run dev        # http://localhost:3000
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run build      # production build
```

- Public application: <http://localhost:3000/apply>
- Recruiter dashboard: <http://localhost:3000/recruiter>

There is no test suite in this build — `npm run typecheck` and `npm run build`
are the checks that exist. Verification is the manual end-to-end pass in §6.

---

## 5. Deploy to Vercel

```bash
vercel link
vercel env add MICROSOFT_TENANT_ID production
# …repeat for each variable in .env.example
vercel --prod
```

Set `NEXTAUTH_URL` to the deployed origin, and add that origin's callback URL to
the app registration (§1).

The large-video upload path is what makes Vercel viable here: the browser PUTs
chunks straight to a Microsoft-hosted upload session URL, so a 500 MB file never
passes through a serverless function and never meets its body-size or execution
limits. The functions only ever handle small JSON.

---

## 6. Verify end-to-end

### Candidate submission

1. Open `/apply` in a private window — no Microsoft account, no sign-in.
2. Step 1–2: fill the required fields.
3. Step 3: upload a real PDF. The progress bar should reach 100%.
4. Step 4: upload an MP4. Watch the network tab — the chunk `PUT`s go to
   `*.sharepoint.com` or `*.up.1drv.com`, **not** to your own origin. That is
   the direct-to-Microsoft path working.
5. Step 5: tick consent, submit. You should get a Candidate ID like
   `NUAIG-2026-00001`.

Then confirm in SharePoint:

- the library has `Candidates/<year>/NUAIG-<year>-00001 - <Name>/` containing
  `Resume.pdf` and `Introduction.mp4` — note the **normalised names**, not
  whatever the files were called on disk;
- the `Candidates` list has one item, `Status` = `New`;
- `CandidateCounters` has a row for the year with `CurrentValue` = 1;
- the candidate's inbox has the confirmation email with the ID in it.

### Things that should fail

Worth actually trying, since these are the guards:

| Attempt | Expected |
|---|---|
| Submit the same email + same position again | Blocked with a friendly duplicate message |
| Same email, *different* position | Allowed |
| Upload a 12 MB resume | Rejected client-side, and by the server if you bypass that |
| Rename `evil.exe` to `resume.pdf` and upload | Upload succeeds, **submit** rejects it — the byte signature is checked at submit time |
| Sign in as a user not in the `Recruiters` list | Authenticates, then "Access denied" |
| Set that user's `Active` to No while they browse | Next request bounces them (within ~60s cache) |

### Recruiter flow

1. Add yourself to the `Recruiters` list with `Active` = Yes.
2. Sign in at `/recruiter`.
3. Confirm the tiles, filters, search and Load more all work.
4. Open the candidate, click **View Resume** — you should be redirected to a
   long expiring URL, never a plain SharePoint document link.
5. Add a note and change the status. Both should appear in their timelines
   attributed to you.
6. Open the same candidate in a second browser as a second recruiter and add
   notes from both at once — both must survive.

---

## Troubleshooting

**`AADSTS7000215: Invalid client secret provided`**
The secret is wrong or expired. Make sure you copied the secret **Value**, not
its ID.

**`AADSTS50011: redirect URI mismatch`**
The exact callback URL is not on the app registration. It must match including
scheme, host, port and path.

**Graph returns 403 on every list call**
The `Sites.Selected` grant (SHAREPOINT_SETUP.md §8) is missing or was applied to
a different app id. `GET /sites/{site-id}/permissions` shows what is actually
bound.

**`Field 'X' does not exist`**
A column's *internal* name does not match. Renaming a column in the SharePoint
UI changes only its display name. Check with
`GET /sites/{id}/lists/{id}/columns` and compare against
SHAREPOINT_SETUP.md §3.

**Sign-in succeeds, then "Access denied"**
Authentication worked; authorization did not. You are not on the `Recruiters`
list, or `Active` is No, or the email there differs from your Entra UPN.

**Uploads stall at 0%**
The browser could not reach the Microsoft upload URL. Check for a corporate
proxy or extension blocking the request; the session URL itself is valid for
about an hour.

**Confirmation email never arrives, submission otherwise fine**
By design — mail failure does not fail a recorded application. Look for
`send_confirmation` with `outcome: failure` in the logs. Usually `Mail.Send`
consent or an application access policy that excludes the mailbox.
