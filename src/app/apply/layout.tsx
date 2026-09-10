import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'

/**
 * Public application chrome (spec.md §6.1): a thin sticky header with the logo
 * on the left and an optional contact link on the right. No sidebar — the step
 * indicator inside the wizard is the only progress affordance.
 */
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  const contactAddress = process.env.CONTACT_EMAIL

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        {/* Full-bleed, matching the recruiter header — logo hard left. */}
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6">
          {/* `/` is the careers landing page now, so the mark goes there. */}
          <Logo href="/" />
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="rounded-md text-sm text-secondary transition-colors hover:text-brand"
            >
              <span aria-hidden className="mr-1.5">&larr;</span>
              Careers
            </Link>
            {contactAddress && (
              <a
                href={`mailto:${contactAddress}`}
                className="hidden rounded-md text-sm text-secondary transition-colors hover:text-brand sm:inline"
              >
                Having trouble? Contact us
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border py-6">
        <p className="w-full px-4 text-xs text-muted sm:px-6">
          Your information is used for recruitment purposes only.
        </p>
      </footer>
    </div>
  )
}
