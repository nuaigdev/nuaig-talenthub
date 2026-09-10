import Link from 'next/link'
import { MAIN_SITE, OFFICE, SOCIAL_LINKS } from '@/lib/careers-content'

/**
 * A slim, text-only footer: the routes back to the main company site, a contact
 * address, and the recruitment-use note. No imagery. The internal repo name and
 * every SharePoint detail stay out of the markup (spec.md §1, §12).
 */
export function CareersFooter() {
  return (
    <footer className="border-t border-border bg-bg">
      <div className="mx-auto max-w-content px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="font-semibold text-ink">NuAIg Careers</span>
            <a href={MAIN_SITE} target="_blank" rel="noopener noreferrer" className="rounded-md text-secondary transition-colors hover:text-brand">
              nuaig.ai
            </a>
            <Link href="/apply" className="rounded-md text-secondary transition-colors hover:text-brand">
              Apply
            </Link>
            <a href={`mailto:${OFFICE.email}`} className="rounded-md text-secondary transition-colors hover:text-brand">
              {OFFICE.email}
            </a>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md text-secondary transition-colors hover:text-brand"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} NuAIg. All rights reserved.</p>
          <p>Information submitted here is used for recruitment purposes only.</p>
        </div>
      </div>
    </footer>
  )
}
