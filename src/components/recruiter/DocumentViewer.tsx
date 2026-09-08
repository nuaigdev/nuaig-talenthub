'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Spinner } from '@/components/ui'

/**
 * In-page document viewing (spec.md §10.2).
 *
 * Documents open in a modal on the candidate's own page — never a download,
 * never a new tab. The recruiter keeps their place in the list, and the
 * SharePoint URL is never rendered into the page.
 *
 * Resume and video are loaded by different routes on purpose. The resume is
 * proxied by our server so it arrives with an inline disposition a browser will
 * render; the video's short-lived Graph URL is fetched and handed straight to
 * the player, so 500MB streams from Microsoft rather than through a function.
 */

type Kind = 'resume' | 'video'

export function DocumentViewer({
  candidateId,
  candidateName,
  hasResume,
  hasVideo,
  resumeExt,
}: {
  candidateId: string
  candidateName: string
  hasResume: boolean
  hasVideo: boolean
  resumeExt: string
}) {
  const [open, setOpen] = useState<Kind | null>(null)

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <OpenButton
          label="View Resume"
          available={hasResume}
          onClick={() => setOpen('resume')}
        />
        <OpenButton label="Watch Video" available={hasVideo} onClick={() => setOpen('video')} />
      </div>

      <p className="mt-3 text-xs text-muted">
        Documents open here through a short-lived secure link and are not publicly accessible.
      </p>

      {open && (
        <Modal
          title={open === 'resume' ? 'Resume' : 'Introduction video'}
          subtitle={`${candidateName} · ${candidateId}`}
          onClose={() => setOpen(null)}
        >
          {open === 'resume' ? (
            <ResumePane candidateId={candidateId} ext={resumeExt} />
          ) : (
            <VideoPane candidateId={candidateId} />
          )}
        </Modal>
      )}
    </>
  )
}

function OpenButton({
  label,
  available,
  onClick,
}: {
  label: string
  available: boolean
  onClick: () => void
}) {
  if (!available) {
    return (
      <span className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm text-muted">
        {label} — not available
      </span>
    )
  }
  return (
    <Button type="button" variant="secondary" onClick={onClick}>
      {label}
    </Button>
  )
}

// ---------------------------------------------------------------------------

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle: string
  onClose: () => void
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Escape closes; the page behind must not scroll while the modal is up.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  // Keep Tab inside the dialog, so focus cannot wander onto the page behind it.
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'button, a[href], iframe, video, [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 sm:p-6"
      onMouseDown={(event) => {
        // Only a click on the backdrop itself closes — not a drag that ends there.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — ${subtitle}`}
        onKeyDown={onKeyDown}
        className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-card"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
            <p className="truncate text-xs text-secondary">{subtitle}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 bg-surface">{children}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ResumePane({ candidateId, ext }: { candidateId: string; ext: string }) {
  const src = `/api/recruiter/documents/${encodeURIComponent(candidateId)}/resume`

  // Only PDF renders in a browser frame. Word documents would show a blank
  // frame or silently download, so say so instead of pretending.
  if (ext && ext !== 'pdf') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Alert tone="info" title={`This resume is a .${ext} file`}>
          Word documents cannot be previewed in the browser. Open it to read it — it will
          download to your device.
        </Alert>
        <a
          href={src}
          className="inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
        >
          Open resume
        </a>
      </div>
    )
  }

  return (
    // Deliberately not sandboxed. Chrome's built-in PDF viewer needs scripting,
    // so `sandbox=""` renders a blank frame — the failure this whole change
    // exists to avoid. The protection that matters is on the response instead:
    // the proxy sets an explicit `application/pdf` content type with `nosniff`,
    // so a file that is not really a PDF is never interpreted as markup.
    <iframe src={src} title="Resume" className="h-full w-full border-0 bg-white" />
  )
}

function VideoPane({ candidateId }: { candidateId: string }) {
  const [state, setState] = useState<
    { phase: 'loading' } | { phase: 'ready'; url: string } | { phase: 'error'; message: string }
  >({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false

    // Fetch the short-lived URL once, so scrubbing talks to Microsoft directly
    // instead of re-entering our function on every seek.
    ;(async () => {
      try {
        const response = await fetch(
          `/api/recruiter/documents/${encodeURIComponent(candidateId)}/video?as=url`,
        )
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok) {
          setState({ phase: 'error', message: payload.error || 'The video could not be loaded.' })
          return
        }
        setState({ phase: 'ready', url: payload.url })
      } catch {
        if (!cancelled) {
          setState({ phase: 'error', message: 'The video could not be loaded. Please try again.' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [candidateId])

  if (state.phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-secondary">
        <Spinner className="text-brand" />
        Loading video…
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert tone="error">{state.message}</Alert>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center bg-ink">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={state.url}
        controls
        autoPlay
        controlsList="nodownload"
        className="max-h-full max-w-full"
      />
    </div>
  )
}
