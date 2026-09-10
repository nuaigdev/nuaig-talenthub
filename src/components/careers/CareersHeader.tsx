import Link from 'next/link'

/**
 * The landing-page header: a slim, solid bar with the NuAIg wordmark on the
 * left and the Apply button on the right. No imagery beyond the brand mark, no
 * scroll tricks — the page is short enough not to need them.
 */
export function CareersHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-content items-center justify-between gap-6 px-5 sm:px-8">
        <Link
          href="/"
          aria-label="NuAIg Careers — home"
          className="inline-flex items-center rounded-md transition-opacity hover:opacity-80"
        >
          {/* The supplied brand mark, used as-is (CLAUDE.md §UI). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt="NuAIg" width={80} height={33} style={{ height: 33, width: 'auto' }} />
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/apply"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
          >
            Apply
            <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  )
}
