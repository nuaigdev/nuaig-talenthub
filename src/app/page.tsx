import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { CareersFooter } from '@/components/careers/CareersFooter'
import { CareersHeader } from '@/components/careers/CareersHeader'
import { LogoMarquee } from '@/components/careers/LogoMarquee'
import { activePositions } from '@/lib/graph/positions'
import {
  CULTURE,
  DOMAINS,
  HIRING_STEPS,
  IMPACT_STATS,
  LIFE_GALLERY,
  MAIN_SITE,
  OFFICE,
  TESTIMONIAL,
  domainForPosition,
} from '@/lib/careers-content'
import { ogImage, siteName, siteUrl } from '@/lib/site'

/**
 * The careers landing page.
 *
 * `/` used to 307 straight to `/apply`, which made the application form the
 * product's entire front door. It is now the marketing surface that sits in
 * front of it: what the company does, what it is like to work here, which roles
 * are open — with `/apply` one click away from every band on the page.
 *
 * The two pages stay deliberately separate. This one is copy and imagery
 * transcribed from nuaig.ai (see `careers-content.ts`); `/apply` remains the
 * unauthenticated form and owns all of the submission machinery.
 */

const landingDescription =
  'Join NuAIg and build across Data, Automation and AI for senior living. See what we do, what it is like to work here, and the roles we are hiring for.'

/**
 * Restated in full rather than inherited: Next merges metadata one level deep,
 * so declaring `openGraph` here at all would otherwise drop the root layout's
 * preview image.
 */
export const metadata: Metadata = {
  // Root layout's `title.default` already reads "Careers at NuAIg"; a `title`
  // here would append the " · NuAIg" template and stutter.
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

/**
 * Rendered per request for the same reason `/apply` is: open roles come from
 * the recruiter-managed `Positions` list, and prerendering would freeze
 * whatever was open at build time into the page.
 */
export const dynamic = 'force-dynamic'

/** Small chevron used on every "go" affordance, so they animate identically. */
function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`h-4 w-4 ${className}`} fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Domain marks, drawn rather than imported. Each is a 24-unit stroke glyph so
 * the three sit on the same optical weight — which a mixed set of photographic
 * service artwork from the main site could not do.
 */
const DOMAIN_GLYPHS: Record<string, React.ReactNode> = {
  chart: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M7 20.5V13" />
      <path d="M12 20.5V5.5" />
      <path d="M17 20.5v-5" />
    </>
  ),
  cycle: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20.2 3.8v3.6h-3.6" />
      <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.6" />
    </>
  ),
  spark: (
    <>
      <path d="M11 3.2l1.6 4.3 4.3 1.6-4.3 1.6L11 15l-1.6-4.3L5.1 9.1l4.3-1.6L11 3.2Z" />
      <path d="M18 14.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
    </>
  ),
}

function DomainGlyph({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DOMAIN_GLYPHS[name]}
    </svg>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">{children}</p>
  )
}

export default async function CareersLandingPage() {
  // Same source as the apply form's dropdown, with the same built-in fallback
  // if the list is unreachable — this page must render regardless.
  const positions = await activePositions()
  // "Other" is the form's catch-all, not a vacancy; the open-application card
  // at the end of the list covers that case with better copy.
  const roles = positions.filter((title) => title.toLowerCase() !== 'other')

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <CareersHeader />

      <main id="main" className="flex-1">
        {/* ---------------------------------------------------------------
            Hero
        ---------------------------------------------------------------- */}
        <section className="relative overflow-hidden bg-navy pt-[72px] text-white">
          <div aria-hidden className="absolute inset-0 bg-aurora" />
          <div aria-hidden className="absolute inset-0 bg-grid" />
          {/* Melts the navy into the white section below instead of a hard edge. */}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-bg/10" />

          <div className="relative mx-auto max-w-content px-5 pb-20 pt-16 sm:px-8 lg:pb-24 lg:pt-24">
            <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
              <div className="animate-rise">
                <span className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.07] py-1.5 pl-2 pr-4 text-sm text-white/85 backdrop-blur">
                  <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">
                    We&rsquo;re hiring
                  </span>
                  Data · Automation · AI
                </span>

                <h1 className="mt-7 text-[2.6rem] font-semibold leading-[1.06] tracking-[-0.025em] sm:text-6xl lg:text-[4.1rem]">
                  Build the AI that gives{' '}
                  <span className="text-gradient-brand">care its time back.</span>
                </h1>

                <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/75">
                  NuAIg is a US-based AI advisory and implementation partner for senior living
                  operators. We work across Data, Automation and AI — from assessment through
                  implementation — and the systems we ship run in real communities, for real
                  residents, on the day they go live.
                </p>

                <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/apply"
                    className="group inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-7 text-[0.95rem] font-semibold text-white shadow-lift transition-colors hover:bg-brand-hover"
                  >
                    Apply now
                    <Arrow className="transition-transform duration-150 group-hover:translate-x-0.5" />
                  </Link>
                  <a
                    href="#roles"
                    className="inline-flex h-12 items-center justify-center rounded-md border border-white/25 px-7 text-[0.95rem] font-medium text-white transition-colors hover:border-white/50 hover:bg-white/5"
                  >
                    See open roles
                  </a>
                </div>

                <p className="mt-7 text-sm text-white/50">
                  One page, no account needed. Takes about five minutes.
                </p>
              </div>

              {/* Photography from the company's own events, offset into a
                  two-card composition so the band is not a single flat image. */}
              {/*
                Fixed heights rather than an aspect ratio: the hero grid is
                `items-center`, and a ratio-sized portrait grows with the column
                until it slides up under the fixed header. The two flanking
                panels are `lg:` only — below that they would sit on top of the
                faces rather than beside them.
              */}
              <div className="relative animate-rise lg:mb-10 lg:pl-4" style={{ animationDelay: '90ms' }}>
                <div className="relative h-[340px] overflow-hidden rounded-2xl border border-white/15 shadow-lift sm:h-[420px] lg:h-[500px]">
                  <Image
                    src="/careers/life/team-1.jpg"
                    alt="NuAIg colleagues at the LeadingAge Annual Meeting"
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 46vw"
                    className="object-cover object-[center_22%]"
                  />
                  {/* Keeps the white overlay panels readable over a bright photo. */}
                  <div
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-navy-deep/80 to-transparent"
                  />
                </div>

                <div className="absolute -bottom-10 -left-10 hidden w-56 overflow-hidden rounded-xl border border-white/20 shadow-lift lg:block">
                  <div className="relative aspect-[4/3]">
                    <Image
                      src="/careers/life/team-6.jpg"
                      alt="The NuAIg team at a customer event"
                      fill
                      sizes="224px"
                      className="object-cover"
                    />
                  </div>
                </div>

                <div className="absolute -bottom-10 right-0 hidden rounded-xl border border-white/15 bg-navy-deep px-5 py-4 shadow-lift lg:block">
                  <p className="text-2xl font-semibold tracking-tight text-white">30–40%</p>
                  <p className="mt-1 max-w-[10rem] text-xs leading-snug text-white/60">
                    less manual admin work for the staff we build for
                  </p>
                </div>
              </div>
            </div>

            {/* Impact counters, transcribed from the main site. */}
            <dl className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
              {IMPACT_STATS.map((stat) => (
                <div key={stat.label} className="bg-navy/85 px-6 py-7 backdrop-blur-sm">
                  <dt className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    {stat.value}
                  </dt>
                  <dd className="mt-2">
                    <span className="block text-sm font-medium text-brand-light">{stat.label}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-white/55">
                      {stat.detail}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Client strip
        ---------------------------------------------------------------- */}
        <section aria-labelledby="clients-heading" className="border-b border-border bg-bg py-14">
          <div className="mx-auto max-w-content px-5 sm:px-8">
            <h2 id="clients-heading" className="text-center text-sm font-medium text-muted">
              The work you ship here runs at leading senior living and healthcare providers
            </h2>
          </div>
          <div className="mt-9">
            <LogoMarquee />
          </div>
        </section>

        {/* ---------------------------------------------------------------
            What we do — the three domains we hire into
        ---------------------------------------------------------------- */}
        <section id="what-we-do" aria-labelledby="what-we-do-heading" className="scroll-mt-24 bg-bg py-24">
          <div className="mx-auto max-w-content px-5 sm:px-8">
            <div className="max-w-2xl">
              <SectionLabel>What we do</SectionLabel>
              <h2 id="what-we-do-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.15]">
                Three domains. One team that takes them all the way.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-secondary">
                Most firms hand over a strategy and leave, or start building before anyone has
                diagnosed the problem. We do both, with the same people — diagnose, design,
                implement, improve. That is also how the engineering work is shaped here.
              </p>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {DOMAINS.map((domain) => (
                <article
                  key={domain.id}
                  className="group relative flex flex-col rounded-2xl border border-border bg-surface-raised p-7 shadow-sm transition-colors duration-200 hover:border-brand"
                >
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-subtle text-brand transition-colors duration-200 group-hover:bg-brand group-hover:text-white">
                    <DomainGlyph name={domain.icon} />
                  </span>

                  <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                    {domain.eyebrow}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">{domain.title}</h3>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-secondary">{domain.body}</p>

                  <ul className="mt-6 space-y-2.5 border-t border-border pt-6">
                    {domain.points.map((point) => (
                      <li key={point} className="flex gap-3 text-sm text-secondary">
                        <svg viewBox="0 0 16 16" aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 text-brand" fill="none">
                          <path d="M3 8.5l3.2 3.2L13 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Why NuAIg — culture
        ---------------------------------------------------------------- */}
        <section id="why-nuaig" aria-labelledby="why-heading" className="scroll-mt-24 border-y border-border bg-surface py-24">
          <div className="mx-auto max-w-content px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <SectionLabel>Why NuAIg</SectionLabel>
                <h2 id="why-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.15]">
                  A great place to do the best work of your career.
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-secondary">
                  At NuAIg, we invest in you. We are committed to creating exceptional employee
                  experiences by supporting your career growth, encouraging innovative and strategic
                  thinking, and nurturing your leadership abilities.
                </p>
                <p className="mt-4 text-lg leading-relaxed text-secondary">
                  Our goal is to empower you with the opportunities, tools and environment you need
                  to thrive.
                </p>
                <Link
                  href="/apply"
                  className="group mt-8 inline-flex items-center gap-2 rounded-md text-[0.95rem] font-semibold text-brand transition-colors hover:text-brand-hover"
                >
                  Start your application
                  <Arrow className="transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
              </div>

              <ul className="grid gap-5 sm:grid-cols-2">
                {CULTURE.map((item) => (
                  <li
                    key={item.title}
                    className="rounded-2xl border border-border bg-surface-raised p-6 shadow-sm transition-shadow duration-200 hover:shadow-card"
                  >
                    <span aria-hidden className="block h-0.5 w-8 rounded-full bg-brand" />
                    <h3 className="mt-5 text-base font-semibold tracking-tight">{item.title}</h3>
                    <p className="mt-2.5 text-[0.95rem] leading-relaxed text-secondary">{item.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Life at NuAIg — photo mosaic
        ---------------------------------------------------------------- */}
        <section id="life" aria-labelledby="life-heading" className="scroll-mt-24 bg-bg py-24">
          <div className="mx-auto max-w-content px-5 sm:px-8">
            <div className="max-w-2xl">
              <SectionLabel>Life here</SectionLabel>
              <h2 id="life-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.15]">
                Small team, industry stage, real customers.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-secondary">
                We are out with our clients constantly — LeadingAge, HIMSS, provider summits, on-site
                in the communities themselves. Engineers here present their own work, sit with the
                caregivers who use it, and watch it change a shift.
              </p>
            </div>

            {/* Asymmetric mosaic: the first tile spans two columns and two rows
                on wide screens, the rest fill around it. Degrades to a plain
                two-column grid on small screens. */}
            <ul className="mt-14 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {LIFE_GALLERY.map((photo, index) => (
                <li
                  key={photo.src}
                  className={
                    index === 0
                      ? 'col-span-2 lg:row-span-2'
                      : index === 3
                        ? 'col-span-2 lg:col-span-2'
                        : ''
                  }
                >
                  <div
                    className={`relative overflow-hidden rounded-xl border border-border bg-surface ${
                      index === 0 ? 'aspect-[4/3] lg:aspect-square' : 'aspect-[4/3]'
                    }`}
                  >
                    <Image
                      src={photo.src}
                      alt={photo.alt}
                      fill
                      loading="lazy"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-200 hover:scale-[1.03]"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Proof — a client on the work itself
        ---------------------------------------------------------------- */}
        <section aria-label="Client testimonial" className="bg-navy py-20 text-white">
          <div className="mx-auto max-w-content px-5 sm:px-8">
            <figure className="relative mx-auto max-w-3xl text-center">
              <svg viewBox="0 0 32 32" aria-hidden className="mx-auto h-8 w-8 text-brand" fill="currentColor">
                <path d="M12.7 6.6C8 8.9 5.2 13 5.2 18.2c0 4.3 2.5 7.2 6.1 7.2 3.1 0 5.4-2.3 5.4-5.3 0-2.9-2-5-4.7-5-.5 0-1.1.1-1.3.2.5-2.6 2.9-5.3 5.6-6.6l-3.6-2.1Zm14.4 0C22.4 8.9 19.6 13 19.6 18.2c0 4.3 2.5 7.2 6.1 7.2 3 0 5.4-2.3 5.4-5.3 0-2.9-2-5-4.7-5-.5 0-1.1.1-1.4.2.6-2.6 3-5.3 5.7-6.6l-3.6-2.1Z" />
              </svg>
              <blockquote className="mt-7 text-balance text-2xl font-medium leading-[1.4] tracking-tight sm:text-[1.9rem]">
                &ldquo;{TESTIMONIAL.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-7 text-sm text-white/60">
                <span className="font-semibold text-white">{TESTIMONIAL.name}</span>
                <span className="mx-2 text-white/25">·</span>
                {TESTIMONIAL.role}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Open roles
        ---------------------------------------------------------------- */}
        <section id="roles" aria-labelledby="roles-heading" className="scroll-mt-24 bg-bg py-24">
          <div className="mx-auto max-w-content px-5 sm:px-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <SectionLabel>Open roles</SectionLabel>
                <h2 id="roles-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.15]">
                  Where we&rsquo;re hiring right now
                </h2>
                <p className="mt-5 text-lg leading-relaxed text-secondary">
                  Every role runs through the same short application. Pick the one that fits — or
                  send us an open application and tell us where you&rsquo;d fit best.
                </p>
              </div>
              <p className="shrink-0 text-sm text-muted">
                {roles.length} {roles.length === 1 ? 'role' : 'roles'} open
              </p>
            </div>

            <ul className="mt-12 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm">
              {roles.map((title) => (
                <li key={title} className="border-b border-border last:border-b-0">
                  <Link
                    href="/apply#position"
                    className="group flex items-center justify-between gap-6 px-6 py-5 transition-colors hover:bg-surface sm:px-8"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold tracking-tight transition-colors group-hover:text-brand">
                        {title}
                      </h3>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-secondary">
                        <span className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-xs font-medium text-brand-deep">
                          {domainForPosition(title)}
                        </span>
                        <span className="text-muted">{OFFICE.line2}</span>
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-brand">
                      <span className="hidden sm:inline">Apply</span>
                      <Arrow className="transition-transform duration-150 group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}

              {/* Always last: covers both "nothing fits" and an empty list. */}
              <li className="border-t border-border bg-surface">
                <Link
                  href="/apply"
                  className="group flex items-center justify-between gap-6 px-6 py-5 transition-colors hover:bg-brand-subtle sm:px-8"
                >
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight transition-colors group-hover:text-brand">
                      Don&rsquo;t see your role?
                    </h3>
                    <p className="mt-1.5 text-sm text-secondary">
                      Send an open application. We read every one.
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-brand">
                    <span className="hidden sm:inline">Get in touch</span>
                    <Arrow className="transition-transform duration-150 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            How hiring works
        ---------------------------------------------------------------- */}
        <section id="hiring" aria-labelledby="hiring-heading" className="scroll-mt-24 border-y border-border bg-surface py-24">
          <div className="mx-auto max-w-content px-5 sm:px-8">
            <div className="max-w-2xl">
              <SectionLabel>How hiring works</SectionLabel>
              <h2 id="hiring-heading" className="mt-4 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.15]">
                Four steps, and you always know where you stand.
              </h2>
            </div>

            <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {HIRING_STEPS.map((step) => (
                <li key={step.step} className="relative rounded-2xl border border-border bg-surface-raised p-6 shadow-sm">
                  <span className="text-sm font-semibold tabular-nums text-brand">{step.step}</span>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2.5 text-[0.95rem] leading-relaxed text-secondary">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------------------
            Closing CTA
        ---------------------------------------------------------------- */}
        <section aria-labelledby="cta-heading" className="relative overflow-hidden bg-navy py-24 text-white">
          <div aria-hidden className="absolute inset-0 bg-aurora" />
          <div aria-hidden className="absolute inset-0 bg-grid" />

          <div className="relative mx-auto max-w-content px-5 text-center sm:px-8">
            <h2 id="cta-heading" className="mx-auto max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.1]">
              Ready to build something that gives people their time back?
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              One short application. No account, no portal, no password to forget — and a reference
              number the moment you submit.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/apply"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-8 text-[0.95rem] font-semibold text-white shadow-lift transition-colors hover:bg-brand-hover"
              >
                Apply now
                <Arrow className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
              <a
                href={MAIN_SITE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-md border border-white/25 px-8 text-[0.95rem] font-medium text-white transition-colors hover:border-white/50 hover:bg-white/5"
              >
                Learn more about NuAIg
              </a>
            </div>

            <p className="mt-8 text-sm text-white/45">
              Questions? <a href={`mailto:${OFFICE.email}`} className="rounded-md text-white/70 underline underline-offset-4 transition-colors hover:text-brand-light">{OFFICE.email}</a>
            </p>
          </div>
        </section>
      </main>

      <CareersFooter />
    </div>
  )
}
