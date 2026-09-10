import type { Metadata } from 'next'
import Link from 'next/link'
import { CareersFooter } from '@/components/careers/CareersFooter'
import { CareersHeader } from '@/components/careers/CareersHeader'
import { CULTURE, MAIN_SITE } from '@/lib/careers-content'
import { ogImage, siteName, siteUrl } from '@/lib/site'

/**
 * The careers landing page.
 *
 * Deliberately narrow: it talks about the culture and what it is like to work
 * at NuAIg, and sends people to the application. It does not restate what the
 * company does, its clients or its services — that lives on nuaig.ai. No
 * imagery; the page is type and space. `/apply` is one click away from the
 * header and the closing call to action.
 */

const landingDescription =
  'Careers at NuAIg — what it is like to work here, and how to apply.'

export const metadata: Metadata = {
  description: landingDescription,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName,
    title: 'Careers at NuAIg',
    description: landingDescription,
    url: siteUrl,
    locale: 'en_US',
    images: [ogImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Careers at NuAIg',
    description: landingDescription,
    images: [ogImage.url],
  },
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function CareersLandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <CareersHeader />

      <main id="main" className="flex-1">
        {/* Hero — type only */}
        <section className="mx-auto max-w-content px-5 pb-16 pt-32 sm:px-8 sm:pb-20 sm:pt-40">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Careers at NuAIg</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.025em] sm:text-6xl">
            Do the best work of your career.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-secondary">
            We build across Data, Automation and AI — and we invest in the people who do it. If you
            want your work to run in production and matter, we should talk.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/apply"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-7 text-[0.95rem] font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
            >
              Apply now
              <Arrow />
            </Link>
            <a
              href={MAIN_SITE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-md border border-border-strong px-7 text-[0.95rem] font-medium text-ink transition-colors hover:border-brand hover:text-brand"
            >
              About NuAIg
            </a>
          </div>
        </section>

        {/* Culture */}
        <section id="culture" className="scroll-mt-24 border-t border-border bg-surface py-20">
          <div className="mx-auto max-w-content px-5 sm:px-8">
            <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              What it’s like to work here
            </h2>
            <ul className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2">
              {CULTURE.map((item) => (
                <li key={item.title}>
                  <span aria-hidden className="block h-0.5 w-8 rounded-full bg-brand" />
                  <h3 className="mt-4 text-base font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-secondary">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-content px-5 py-20 text-center sm:px-8">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Ready to apply?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-secondary">
            Tell us about yourself and what you want to work on.
          </p>
          <Link
            href="/apply"
            className="group mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-8 text-[0.95rem] font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
          >
            Apply now
            <Arrow />
          </Link>
        </section>
      </main>

      <CareersFooter />
    </div>
  )
}
