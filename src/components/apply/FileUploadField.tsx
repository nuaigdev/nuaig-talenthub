'use client'

import { useCallback, useRef, useState } from 'react'
import clsx from 'clsx'
import { Alert, Button, Spinner } from '@/components/ui'
import {
  UploadCancelledError,
  formatBytes,
  requestUploadSession,
  uploadInChunks,
  type UploadedItem,
} from '@/lib/upload-client'

/**
 * One file, uploaded straight to Microsoft (spec.md §9 steps 3–4).
 *
 * Local validation here is a fast-feedback affordance only — the server
 * re-checks type and size when minting the session, and sniffs the actual bytes
 * at submit time. The progress bar tracks real bytes accepted by the upload
 * session, and a failure offers a retry that resumes rather than restarting.
 */

export type UploadState =
  | { phase: 'empty' }
  | { phase: 'uploading'; fileName: string; uploaded: number; total: number }
  | { phase: 'done'; item: UploadedItem; originalName: string }
  | { phase: 'error'; message: string; fileName?: string }

export function FileUploadField({
  kind,
  label,
  accept,
  acceptLabel,
  maxBytes,
  allowedTypes,
  state,
  onState,
  draftToken,
  onDraftToken,
}: {
  kind: 'resume' | 'video'
  label: string
  accept: string
  acceptLabel: string
  maxBytes: number
  allowedTypes: string[]
  state: UploadState
  onState: (state: UploadState) => void
  draftToken?: string
  onDraftToken: (token: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [lastFile, setLastFile] = useState<File | null>(null)
  const inputId = `${kind}-file`

  const start = useCallback(
    async (file: File) => {
      const limitMb = Math.round(maxBytes / (1024 * 1024))

      if (file.size > maxBytes) {
        onState({
          phase: 'error',
          message: `That file is ${formatBytes(file.size)}. The maximum size is ${limitMb} MB.`,
          fileName: file.name,
        })
        return
      }
      // Some browsers report an empty type for .doc; fall back to the extension
      // for the local check only — the server still decides.
      const declared = file.type || guessTypeFromName(file.name)
      if (!allowedTypes.includes(declared)) {
        onState({
          phase: 'error',
          message: `That file type is not accepted. Please upload ${acceptLabel}.`,
          fileName: file.name,
        })
        return
      }

      setLastFile(file)
      const controller = new AbortController()
      abortRef.current = controller
      onState({ phase: 'uploading', fileName: file.name, uploaded: 0, total: file.size })

      try {
        const session = await requestUploadSession({
          kind,
          file: new File([file], file.name, { type: declared }),
          draftToken,
        })
        onDraftToken(session.draftToken)

        const item = await uploadInChunks(session.uploadUrl, file, {
          signal: controller.signal,
          onProgress: (uploaded, total) =>
            onState({ phase: 'uploading', fileName: file.name, uploaded, total }),
        })

        onState({ phase: 'done', item: { ...item, contentType: declared }, originalName: file.name })
      } catch (error) {
        if (error instanceof UploadCancelledError) {
          onState({ phase: 'empty' })
          return
        }
        onState({
          phase: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'The upload failed. Please check your connection and try again.',
          fileName: file.name,
        })
      } finally {
        abortRef.current = null
      }
    },
    [acceptLabel, allowedTypes, draftToken, kind, maxBytes, onDraftToken, onState],
  )

  const percent =
    state.phase === 'uploading' && state.total > 0
      ? Math.min(100, Math.round((state.uploaded / state.total) * 100))
      : 0

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
        <span className="ml-0.5 text-[#DC2626]" aria-hidden="true">
          *
        </span>
        <span className="sr-only"> (required)</span>
      </label>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only-focusable"
        aria-describedby={`${inputId}-hint`}
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Reset so re-picking the same file after an error still fires change.
          event.target.value = ''
          if (file) void start(file)
        }}
      />

      <div
        className={clsx(
          'rounded-lg border border-dashed p-5 transition-colors',
          state.phase === 'error' ? 'border-[#FECACA] bg-[#FEF2F2]' : 'border-border-strong bg-surface',
        )}
      >
        {state.phase === 'empty' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id={`${inputId}-hint`} className="text-sm text-secondary">
              {acceptLabel} · up to {Math.round(maxBytes / (1024 * 1024))} MB
            </p>
            <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
          </div>
        )}

        {state.phase === 'uploading' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-ink">
                <Spinner className="text-brand" />
                <span className="truncate">{state.fileName}</span>
              </span>
              <span className="shrink-0 tabular-nums text-secondary">{percent}%</span>
            </div>

            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Uploading ${state.fileName}`}
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-secondary">
              <span className="tabular-nums">
                {formatBytes(state.uploaded)} of {formatBytes(state.total)}
              </span>
              <button
                type="button"
                className="font-medium text-secondary underline underline-offset-2 hover:text-ink"
                onClick={() => abortRef.current?.abort()}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {state.phase === 'done' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#16A34A1F] text-xs font-semibold text-[#16A34A]"
                aria-hidden="true"
              >
                ✓
              </span>
              <div className="min-w-0">
                {/* The candidate's own filename, shown back to them. It is never
                    what gets stored — storage names are normalised (§7.1). */}
                <p className="truncate text-sm font-medium text-ink">{state.originalName}</p>
                <p className="text-xs text-secondary">
                  Uploaded · {formatBytes(state.item.size)}
                </p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
              Replace
            </Button>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="space-y-3">
            <Alert tone="error">{state.message}</Alert>
            <div className="flex flex-wrap gap-2">
              {lastFile && (
                <Button type="button" size="sm" onClick={() => void start(lastFile)}>
                  Retry upload
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                Choose a different file
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Browsers sometimes report no MIME type for .doc/.docx; infer for the local check. */
function guessTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'mp4':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    default:
      return ''
  }
}
