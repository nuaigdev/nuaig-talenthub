import Link from 'next/link'
import { MAIN_SITE, OFFICE, SOCIAL_LINKS } from '@/lib/careers-content'

/**
 * Landing-page footer: office details and the routes back to the main company
 * site. Everything that leaves this origin is an explicit outbound link to
 * nuaig.ai or a company social profile — the internal repo name and every
 * SharePoint detail stay out of the markup (spec.md §1, §12).
 */
export function CareersFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy-deep text-white/70">
      <div className="mx-auto max-w-content px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-white.svg" alt="NuAIg" width={106} height={44} style={{ height: 44, width: 'auto' }} />
            <p className="mt-5 max-w-sm text-sm leading-relaxed">
              A US-based AI advisory and implementation partner for senior living operators. We work
              across Data, Automation and AI — from assessment through implementation.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              {SOCIAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md text-sm text-white/60 transition-colors hover:text-brand-light"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Careers</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link href="/apply" className="rounded-md transition-colors hover:text-brand-light">
                  Apply now
                </Link>
              </li>
              <li>
                <a href="#roles" className="rounded-md transition-colors hover:text-brand-light">
                  Open roles
                </a>
              </li>
              <li>
                <a href="#life" className="rounded-md transition-colors hover:text-brand-light">
                  Life at NuAIg
                </a>
              </li>
              <li>
                <a href="#hiring" className="rounded-md transition-colors hover:text-brand-light">
                  How hiring works
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">Company</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href={MAIN_SITE} target="_blank" rel="noopener noreferrer" className="rounded-md transition-colors hover:text-brand-light">
                  nuaig.ai
                </a>
              </li>
              <li>
                <a href={`${MAIN_SITE}/about-us/`} target="_blank" rel="noopener noreferrer" className="rounded-md transition-colors hover:text-brand-light">
                  About us
                </a>
              </li>
              <li className="pt-2 not-italic">
                <address className="not-italic leading-relaxed text-white/60">
                  {OFFICE.line1}
                  <br />
                  {OFFICE.line2}
                </address>
              </li>
              <li>
                <a href={OFFICE.phoneHref} className="rounded-md transition-colors hover:text-brand-light">
                  {OFFICE.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${OFFICE.email}`} className="rounded-md transition-colors hover:text-brand-light">
                  {OFFICE.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} NuAIg. All rights reserved.</p>
          <p>Information submitted here is used for recruitment purposes only.</p>
        </div>
      </div>
    </footer>
  )
}
