'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { Logo } from '@/components/brand/Logo'

/**
 * Recruiter chrome (spec.md §6.2): logo, horizontal nav, global search, user
 * menu. Sticky, same 64px height as the public header so the two experiences
 * feel like one product. No sidebar.
 *
 * This is the only search box in the recruiter app — the filter bar used to
 * carry a second one writing the same `search` param. Being the only one means
 * it has to behave like a filter rather than a quick-jump: it shows the active
 * term instead of clearing itself, submits empty to clear, and stays on the
 * current list so a position or status filter survives the search.
 */

const NAV = [
  { href: '/recruiter', label: 'Dashboard', exact: true },
  { href: '/recruiter/candidates', label: 'Candidates', exact: false },
  { href: '/recruiter/positions', label: 'Positions', exact: false },
  // Room is deliberately left here for a future Reports link (§6.2).
]

export function RecruiterHeader({
  displayName,
  email,
  signOutAction,
}: {
  displayName: string
  email: string
  /** Server action supplied by the layout — sign-out must be a POST, not a link. */
  signOutAction: () => Promise<void>
}) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState(params.get('search') ?? '')

  // The two views that list candidates, and so can hold a search. The detail
  // page sits under /recruiter/candidates/ too, hence the exact match.
  const onList = pathname === '/recruiter' || pathname === '/recruiter/candidates'

  // Keep the box showing whatever the URL says — Back, Clear, or a summary tile.
  useEffect(() => {
    setQuery(params.get('search') ?? '')
  }, [params])

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  function jump(event: React.FormEvent) {
    event.preventDefault()
    const term = query.trim()

    // Searching from a list keeps that list and its other filters; from
    // anywhere else (a candidate, Positions) the dashboard owns the result.
    const base = onList ? pathname : '/recruiter'
    const next = new URLSearchParams(onList ? params.toString() : '')

    // An empty submit clears the search rather than doing nothing — with no
    // filter-bar box left, this is how a recruiter gets back to the full list
    // without also dropping their position and status filters.
    if (term) next.set('search', term)
    else next.delete('search')
    next.delete('cursor')

    const rest = next.toString()
    router.push(rest ? `${base}?${rest}` : base)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      {/* Full-bleed: the header spans the viewport and the logo sits hard left,
          rather than being pulled inward by a centred content container. */}
      <div className="flex h-16 w-full items-center gap-6 px-4 sm:px-6">
        <Logo href="/recruiter" />

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'text-brand underline decoration-2 underline-offset-8'
                    : 'text-secondary hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <form onSubmit={jump} role="search">
            <label htmlFor="global-search" className="sr-only">
              Search candidates by name, ID or email
            </label>
            <input
              id="global-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, ID or email…"
              className="h-9 w-36 rounded-md border border-border bg-white px-3 text-sm text-ink transition-colors placeholder:text-muted focus:border-brand focus:outline-none sm:w-56"
            />
          </form>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-white"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand"
                aria-hidden="true"
              >
                {initials || '?'}
              </span>
              <span className="hidden max-w-[10rem] truncate text-sm text-ink lg:block">
                {displayName}
              </span>
            </button>

            {menuOpen && (
              <>
                {/* Click-away layer, so the menu closes on any outside click. */}
                <button
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-white shadow-card"
                >
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-sm font-medium text-ink">{displayName}</p>
                    <p className="truncate text-xs text-secondary">{email}</p>
                  </div>
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="block w-full px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-surface"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
