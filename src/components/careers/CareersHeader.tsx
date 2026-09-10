'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { CAREERS_NAV } from '@/lib/careers-content'

/**
 * The landing page header.
 *
 * It sits over the dark hero, so it starts transparent with the white wordmark
 * and swaps to the solid light chrome — and the standard mark — once the hero
 * has scrolled past. `logo-white.svg` was shipped for exactly this and had no
 * use in v1; neither variant is recoloured or filtered, only chosen between.
 *
 * A client component purely for that scroll state and the mobile disclosure.
 * The nav links are plain in-page anchors, so the page is fully usable before
 * hydration; only the colour swap waits for JS.
 */
export function CareersHeader() {
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // 72px ≈ the header's own height: the swap lands as the hero's top edge
    // passes under it, rather than on the first pixel of scroll.
    const onScroll = () => setSolid(window.scrollY > 72)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // The open menu paints its own light panel, so the bar must be light too.
  const light = solid || open

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-200',
        light ? 'border-b border-border bg-white/90 backdrop-blur-md' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-[72px] max-w-content items-center justify-between gap-6 px-5 sm:px-8">
        <Link
          href="/"
          aria-label="NuAIg Careers — home"
          className="inline-flex items-center rounded-md transition-opacity hover:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={light ? '/brand/logo.svg' : '/brand/logo-white.svg'}
            alt="NuAIg"
            width={82}
            height={34}
            style={{ height: 34, width: 'auto' }}
          />
          <span
            className={clsx(
              'ml-3 hidden border-l pl-3 text-sm font-medium sm:inline-block',
              light ? 'border-border text-secondary' : 'border-white/25 text-white/80',
            )}
          >
            Careers
          </span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {CAREERS_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={clsx(
                'rounded-md px-3 py-2 text-sm transition-colors',
                light ? 'text-secondary hover:text-brand' : 'text-white/75 hover:text-white',
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/apply"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
          >
            Apply
            <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="careers-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={clsx(
              'inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors md:hidden',
              light ? 'border-border-strong text-ink' : 'border-white/25 text-white',
            )}
          >
            <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="careers-menu" aria-label="Sections" className="border-t border-border bg-white px-5 py-2 md:hidden">
          {CAREERS_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-3 text-sm text-secondary transition-colors hover:text-brand"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}
