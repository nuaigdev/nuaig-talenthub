/**
 * Copy for the careers landing page (`/`).
 *
 * The page is deliberately narrow: it speaks to what it is like to work at
 * NuAIg and points to the application. Everything about what the company does,
 * its clients, and its services lives on the main site (nuaig.ai) and is not
 * duplicated here — a careers page, not a second marketing site.
 *
 * Not `server-only`: public copy with nothing sensitive in it.
 */

/**
 * Culture claims, each grounded in something the company states publicly — the
 * careers page's "we invest in you", the human-first AI stance, and the way the
 * same team carries work from strategy through delivery.
 */
export const CULTURE = [
  {
    title: 'We invest in you',
    body: 'Career growth, innovative and strategic thinking, and leadership development are the stated commitment — not a perk page. You get the opportunities, tools and environment to thrive.',
  },
  {
    title: 'Human-first AI',
    body: 'We do not build AI to replace people. Every system we ship is judged on whether it gives someone their time back. That principle survives contact with the roadmap.',
  },
  {
    title: 'Strategy and delivery, one team',
    body: 'The same team diagnoses, designs, implements and improves. You will not hand a deck to someone else and walk away — you see your own work run in production.',
  },
  {
    title: 'Real work, real constraints',
    body: 'You work on systems that run in real organisations, with real users and real deadlines — practical implementations judged on the results they move, not on how novel the demo looked.',
  },
] as const

export const OFFICE = {
  email: 'info@nuaig.ai',
} as const

export const SOCIAL_LINKS = [
  { href: 'https://www.linkedin.com/company/nuaig/', label: 'LinkedIn' },
  { href: 'https://x.com/NuAIg_ai', label: 'X' },
] as const

export const MAIN_SITE = 'https://www.nuaig.ai'
