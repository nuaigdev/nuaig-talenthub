/**
 * Browser-side resumable upload (spec.md §9 step 4, §3 decision 3).
 *
 * Chunks go straight from the browser to the Microsoft-hosted upload session
 * URL. Nothing here touches our own server, so a 500MB video never meets a
 * Vercel function body limit.
 *
 * Three properties the spec asks for explicitly:
 *   - the file is never fully buffered in memory (`Blob.slice` per chunk);
 *   - progress reflects real bytes accepted, not a fake timer;
 *   - a transient failure retries *that chunk*, not the whole file, and the
 *     server is asked where it actually got to before resuming.
 */

/** Graph requires chunk sizes that are a multiple of 320 KiB. */
const CHUNK_UNIT = 320 * 1024
const CHUNK_SIZE = CHUNK_UNIT * 16 // 5 MiB
const MAX_CHUNK_ATTEMPTS = 4

export type UploadedItem = {
  itemId: string
  fileName: string
  contentType: string
  size: number
}

export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled')
    this.name = 'UploadCancelledError'
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new UploadCancelledError())
      },
      { once: true },
    )
  })
}

/**
 * Asks the upload session how much it already holds, so a resumed upload
 * restarts from the true offset rather than from where the client thinks it
 * got to.
 */
async function nextExpectedOffset(uploadUrl: string, fallback: number): Promise<number> {
  try {
    const response = await fetch(uploadUrl, { method: 'GET' })
    if (!response.ok) return fallback
    const payload = (await response.json()) as { nextExpectedRanges?: string[] }
    const range = payload.nextExpectedRanges?.[0]
    if (!range) return fallback
    const start = Number(range.split('-')[0])
    return Number.isFinite(start) ? start : fallback
  } catch {
    return fallback
  }
}

export type UploadHandlers = {
  onProgress?: (uploadedBytes: number, totalBytes: number) => void
  signal?: AbortSignal
}

/**
 * Uploads `file` to an existing Graph upload session and resolves with the
 * created drive item.
 */
export async function uploadInChunks(
  uploadUrl: string,
  file: File,
  { onProgress, signal }: UploadHandlers = {},
): Promise<UploadedItem> {
  const total = file.size
  let offset = 0

  while (offset < total) {
    if (signal?.aborted) throw new UploadCancelledError()

    const end = Math.min(offset + CHUNK_SIZE, total)
    const chunk = file.slice(offset, end)
    let lastError: unknown = null
    let accepted = false

    for (let attempt = 0; attempt < MAX_CHUNK_ATTEMPTS && !accepted; attempt += 1) {
      try {
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
          },
          body: chunk,
          signal,
        })

        // 200/201 close the session and return the finished item; 202 means the
        // chunk landed and more are expected.
        if (response.status === 200 || response.status === 201) {
          const item = (await response.json()) as {
            id: string
            name: string
            size: number
            file?: { mimeType?: string }
          }
          onProgress?.(total, total)
          return {
            itemId: item.id,
            fileName: item.name,
            contentType: item.file?.mimeType || file.type,
            size: item.size ?? total,
          }
        }

        if (response.status === 202) {
          accepted = true
          break
        }

        // 4xx other than 404/409 is a permanent problem — retrying won't help.
        if (response.status >= 400 && response.status < 500 && response.status !== 404) {
          throw new Error(`Upload rejected with status ${response.status}`)
        }

        lastError = new Error(`Unexpected upload status ${response.status}`)
      } catch (error) {
        if (error instanceof UploadCancelledError || (error as Error)?.name === 'AbortError') {
          throw new UploadCancelledError()
        }
        lastError = error
      }

      if (!accepted) {
        if (attempt === MAX_CHUNK_ATTEMPTS - 1) break
        await delay(500 * 2 ** attempt, signal)
        // Re-sync before retrying: the chunk may in fact have landed.
        offset = await nextExpectedOffset(uploadUrl, offset)
        if (offset >= total) break
      }
    }

    if (!accepted && offset < total) {
      throw lastError instanceof Error
        ? lastError
        : new Error('Upload failed after multiple attempts')
    }

    offset = end
    onProgress?.(offset, total)
  }

  // The loop normally returns from the 200/201 branch. Reaching here means the
  // final chunk was answered with 202, so ask the session for the committed item.
  const response = await fetch(uploadUrl, { method: 'GET' })
  if (response.ok) {
    const payload = (await response.json()) as { id?: string; name?: string; size?: number }
    if (payload.id) {
      return {
        itemId: payload.id,
        fileName: payload.name ?? file.name,
        contentType: file.type,
        size: payload.size ?? total,
      }
    }
  }
  throw new Error('Upload completed but no item was returned')
}

export type UploadSessionResponse = {
  uploadUrl: string
  draftToken: string
  storageName: string
  expirationDateTime: string
}

/** Asks our server for an upload session. Only small JSON crosses this call. */
export async function requestUploadSession(input: {
  kind: 'resume' | 'video'
  file: File
  draftToken?: string
}): Promise<UploadSessionResponse> {
  const response = await fetch('/api/apply/upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: input.kind,
      fileName: input.file.name,
      contentType: input.file.type,
      size: input.file.size,
      draftToken: input.draftToken,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || 'Could not start the upload. Please try again.')
  }
  return payload as UploadSessionResponse
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
