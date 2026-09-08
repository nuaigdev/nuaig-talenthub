'use client'

import { useEffect } from 'react'

/**
 * Last-resort boundary. Candidates and recruiters see generic copy only —
 * the technical detail was already logged server-side (spec.md §13).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // `digest` is the only handle that ties this screen to the server log entry.
    console.error(JSON.stringify({ level: 'error', message: 'Unhandled UI error', digest: error.digest }))
  }, [error])

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="mt-1.5 text-sm text-secondary">
        This page could not be displayed because of a temporary system issue. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex h-10 items-center rounded-md bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
      >
        Try again
      </button>
    </div>
  )
}
