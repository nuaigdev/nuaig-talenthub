import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { appOnlyClient, getAppOnlyToken, isNotFound, wrapGraphError } from './client'
import { sharePointEnv } from '../env'
import { AppError } from '../errors'
import { encodeGraphPath } from '../sanitize'

/**
 * Document library operations (spec.md §7.1, §3 decision 3).
 *
 * Upload strategy: files are uploaded by the *browser* straight to a Graph
 * upload session URL, never proxied through a Vercel function (a 500MB video
 * through a serverless function is exactly what decision 3 rules out). Since
 * the candidate ID does not exist until submit time, uploads land in a
 * per-session draft folder and are *moved* into the real candidate folder on
 * submit — a metadata PATCH, so a successful upload is never re-uploaded.
 */

const DRAFTS_FOLDER = '_drafts'

export type DriveItem = {
  id: string
  name: string
  webUrl: string
  size?: number
  file?: { mimeType?: string }
  parentReference?: { id?: string; path?: string }
  '@microsoft.graph.downloadUrl'?: string
}

function driveApi(suffix = ''): string {
  return `/drives/${sharePointEnv.driveId}${suffix}`
}

/** Addresses an item by library-relative path rather than id. */
function pathApi(path: string, suffix = ''): string {
  return `${driveApi(`/root:/${encodeGraphPath(path)}:`)}${suffix}`
}

// ---------------------------------------------------------------------------
// Draft tokens
// ---------------------------------------------------------------------------

/**
 * A draft token names the folder an in-progress application uploads into. It is
 * HMAC-signed so a caller cannot hand us an arbitrary folder name — the token
 * is attacker-supplied input that becomes a path segment, so it is verified
 * before it is ever concatenated into a Graph path.
 */
function draftSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('Missing required environment variable: NEXTAUTH_SECRET')
  return secret
}

function sign(value: string): string {
  return createHmac('sha256', draftSecret()).update(`draft:${value}`).digest('base64url')
}

export function issueDraftToken(): string {
  const id = randomUUID()
  return `${id}.${sign(id)}`
}

export function verifyDraftToken(token: string): string {
  const [id, signature] = token.split('.')
  // A UUID is the only shape we ever issue; anything else cannot be a path segment.
  const wellFormed =
    !!id &&
    !!signature &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)

  if (!wellFormed) {
    throw new AppError('VALIDATION_FAILED', 'Malformed draft token')
  }

  const expected = Buffer.from(sign(id))
  const provided = Buffer.from(signature)
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new AppError('VALIDATION_FAILED', 'Draft token signature mismatch')
  }

  return id
}

function draftFolderPath(draftId: string): string {
  return `${sharePointEnv.candidatesRoot}/${DRAFTS_FOLDER}/${draftId}`
}

export function candidateFolderPath(year: string, folderName: string): string {
  return `${sharePointEnv.candidatesRoot}/${year}/${folderName}`
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/** Creates every missing segment of `path`, returning the leaf item. */
export async function ensureFolderPath(path: string): Promise<DriveItem> {
  const client = appOnlyClient()
  const segments = path.split('/').filter(Boolean)

  let parentApi = driveApi('/root')
  let item: DriveItem | null = null

  for (const segment of segments) {
    try {
      item = (await client.api(`${parentApi}/children`).post({
        name: segment,
        folder: {},
        // Concurrent submissions in the same year must not fight over the year
        // folder; `fail` + swallow-409 keeps whichever one won.
        '@microsoft.graph.conflictBehavior': 'fail',
      })) as DriveItem
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status !== 409) {
        throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', `create folder "${segment}"`)
      }
      // Already there — read it instead.
      try {
        item = (await client
          .api(`${parentApi}:/${encodeURIComponent(segment)}`)
          .get()) as DriveItem
      } catch (readError) {
        throw wrapGraphError(readError, 'GRAPH_UNAVAILABLE', `read folder "${segment}"`)
      }
    }

    parentApi = driveApi(`/items/${item!.id}`)
  }

  if (!item) throw new AppError('GRAPH_UNAVAILABLE', `Empty folder path: "${path}"`)
  return item
}

export async function ensureDraftFolder(draftId: string): Promise<DriveItem> {
  return ensureFolderPath(draftFolderPath(draftId))
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export type UploadSession = { uploadUrl: string; expirationDateTime: string }

/**
 * Creates a resumable upload session inside the draft folder and returns its
 * URL. That URL is the single piece of Graph-adjacent capability the browser is
 * ever given (spec.md §12): short-lived, scoped to one file, and conferring no
 * ability to read anything.
 */
export async function createUploadSession(
  draftId: string,
  fileName: string,
  size: number,
): Promise<UploadSession> {
  await ensureDraftFolder(draftId)
  const client = appOnlyClient()
  const path = `${draftFolderPath(draftId)}/${fileName}`

  try {
    return (await client.api(pathApi(path, '/createUploadSession')).post({
      item: {
        '@microsoft.graph.conflictBehavior': 'replace',
        name: fileName,
      },
      deferCommit: false,
      fileSize: size,
    })) as UploadSession
  } catch (error) {
    throw wrapGraphError(error, 'UPLOAD_FAILED', 'create upload session')
  }
}

export async function getItem(itemId: string): Promise<DriveItem> {
  const client = appOnlyClient()
  try {
    return (await client.api(driveApi(`/items/${itemId}`)).get()) as DriveItem
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'read drive item')
  }
}

/**
 * Confirms an uploaded item really is inside the draft folder this submission
 * owns. Without this, a caller could report any item id in the library as
 * "their" resume and have it linked from their candidate record.
 */
export async function assertItemInDraft(itemId: string, draftId: string): Promise<DriveItem> {
  const item = await getItem(itemId)
  const parentPath = item.parentReference?.path ?? ''

  if (!parentPath.endsWith(`/${DRAFTS_FOLDER}/${draftId}`)) {
    throw new AppError('VALIDATION_FAILED', 'Uploaded item does not belong to this submission', {
      context: { itemId },
    })
  }
  return item
}

/** Moves an item into `targetFolderId`, renaming it to the normalised name. */
export async function moveItem(
  itemId: string,
  targetFolderId: string,
  newName: string,
): Promise<DriveItem> {
  const client = appOnlyClient()
  try {
    return (await client.api(driveApi(`/items/${itemId}`)).patch({
      parentReference: { id: targetFolderId },
      name: newName,
      '@microsoft.graph.conflictBehavior': 'replace',
    })) as DriveItem
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'move drive item')
  }
}

/**
 * Best-effort cleanup. Never throws: it runs on a path that is *already*
 * failing, and its own failure is reported as ORPHANED_FILES for an admin to
 * pick up rather than replacing the original error (spec.md §9).
 */
export async function tryDeleteItem(itemId: string): Promise<boolean> {
  const client = appOnlyClient()
  try {
    await client.api(driveApi(`/items/${itemId}`)).delete()
    return true
  } catch (error) {
    return isNotFound(error)
  }
}

/**
 * A short-lived, pre-authenticated download URL for one file. Graph mints these
 * with roughly an hour of validity, and they honour range requests so the intro
 * video streams rather than downloading whole. This is what recruiters are
 * redirected to — never a persistent public SharePoint link (spec.md §10.2).
 */
export async function getDownloadUrl(itemId: string): Promise<string> {
  const client = appOnlyClient()

  try {
    // Deliberately unprojected. `@microsoft.graph.downloadUrl` is an instance
    // annotation, not a field, and Graph drops it as soon as $select narrows
    // the response — asking for it by name is precisely how you lose it.
    const item = (await client.api(driveApi(`/items/${itemId}`)).get()) as DriveItem
    const url = item['@microsoft.graph.downloadUrl']
    if (url) return url
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'mint download URL')
  }

  // Fallback for the cases where Graph still withholds the annotation: the
  // content endpoint answers with a 302 to the same short-lived URL.
  try {
    const token = await getAppOnlyToken()
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${sharePointEnv.driveId}/items/${itemId}/content`,
      { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', cache: 'no-store' },
    )

    const location = response.headers.get('location')
    if (location) return location
  } catch (error) {
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'mint download URL via content redirect')
  }

  throw new AppError('GRAPH_UNAVAILABLE', 'Graph returned no download URL', {
    context: { itemId },
  })
}

/**
 * Reads the first `byteCount` bytes of a stored file, for magic-number
 * sniffing at submit time (spec.md §12). Uses a ranged GET against the
 * short-lived download URL so a 500MB video costs a few hundred bytes to check.
 */
export async function readFilePrefix(itemId: string, byteCount = 32): Promise<Uint8Array> {
  const url = await getDownloadUrl(itemId)
  const response = await fetch(url, {
    headers: { Range: `bytes=0-${byteCount - 1}` },
    cache: 'no-store',
  })

  if (!response.ok && response.status !== 206) {
    throw new AppError('UPLOAD_FAILED', `Prefix read failed: ${response.status}`, {
      context: { itemId },
    })
  }

  return new Uint8Array(await response.arrayBuffer())
}

/** Lists the files in a folder, addressed by library-relative path. */
export async function listChildren(folderPath: string): Promise<DriveItem[]> {
  const client = appOnlyClient()
  try {
    const response = await client
      .api(pathApi(folderPath, '/children'))
      .select('id,name,webUrl,size,file')
      .get()
    return (response.value ?? []) as DriveItem[]
  } catch (error) {
    if (isNotFound(error)) return []
    throw wrapGraphError(error, 'GRAPH_UNAVAILABLE', 'list folder children')
  }
}

/**
 * Finds a candidate's stored document by its normalised base name. Storage
 * names are always `Resume.{ext}` / `Introduction.{ext}` (spec.md §7.1) but the
 * extension varies with what was uploaded, so match on the base name.
 */
export async function findCandidateDocument(
  folderPath: string,
  baseName: 'Resume' | 'Introduction',
): Promise<DriveItem | null> {
  const children = await listChildren(folderPath)
  return children.find((child) => child.name.split('.')[0] === baseName) ?? null
}
