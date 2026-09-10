/**
 * Public, non-secret facts about where this app is served from, used to build
 * the link-preview (Open Graph) metadata. Deliberately *not* `server-only`:
 * nothing here is sensitive, and Next evaluates `metadata` outside the graph
 * module boundary.
 *
 * Crawlers (WhatsApp, Teams, Slack, LinkedIn) only accept absolute URLs, so
 * `metadataBase` has to resolve to the real origin at build time. The
 * production domain is the default rather than something derived from
 * NEXTAUTH_URL or a Vercel system variable: those follow the *deployment*, and
 * a preview or localhost value there would silently point every shared link's
 * preview image at a host nobody else can reach. Override only via
 * NEXT_PUBLIC_SITE_URL, and only if the canonical domain changes.
 */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://careers.nuaig.ai'

/** The internal repo name `talenthub` is never surfaced (spec.md §1). */
export const siteName = 'NuAIg Careers'

export const siteTagline = 'Careers at NuAIg'

export const siteDescription =
  'Explore open roles at NuAIg and apply in minutes — one short form, no account needed.'

/**
 * A pre-rendered 1200×630 PNG, not the brand SVG: WhatsApp and Teams both
 * ignore SVG previews. `public/brand/logo.svg` is composited into it unaltered
 * (see the generator note in README) so the mark is never recoloured.
 */
export const ogImage = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'NuAIg — Careers. Explore open roles and apply in minutes.',
  type: 'image/png',
} as const
