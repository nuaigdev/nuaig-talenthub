/**
 * Copy and imagery for the careers landing page (`/`).
 *
 * Everything here is transcribed from the public company site, nuaig.ai — the
 * positioning, the service descriptions, the counters, the client list and the
 * office details. It is kept in one module rather than inlined into the page so
 * that refreshing the page when the main site changes is a content edit, not a
 * markup edit.
 *
 * Not `server-only`: this is public marketing copy with nothing sensitive in
 * it, and the header/marquee client components read from it too.
 *
 * The photographs under `public/careers/` are the company's own event and team
 * images, pulled from the same site and served locally rather than hotlinked,
 * so the page does not depend on nuaig.ai staying up or keeping its upload
 * paths stable. `public/brand/logo*.svg` remains the only source of the mark
 * itself — nothing here recolours or substitutes it.
 */

export const CAREERS_NAV = [
  { href: '#what-we-do', label: 'What we do' },
  { href: '#why-nuaig', label: 'Why NuAIg' },
  { href: '#life', label: 'Life here' },
  { href: '#roles', label: 'Open roles' },
] as const

/**
 * The homepage counters, read from the live site's counter widgets rather than
 * its rendered text — the markup renders "0" and animates up to these values.
 */
export const IMPACT_STATS = [
  { value: '135+', label: 'Processes mapped', detail: 'Across clinical, back-office and leadership workflows' },
  { value: '45,000', label: 'Hours assessed', detail: 'Measured before a single line of automation is written' },
  { value: '90%', label: 'Efficiency improvement', detail: 'On the workflows our teams have taken end to end' },
] as const

/**
 * The three domains the company builds in — and the three we hire into.
 *
 * `icon` names a glyph drawn inline on the page rather than an asset path. The
 * main site's service artwork is a set of photographic cards with their own
 * titles baked into the pixels; reused here they would render as muddy 28px
 * thumbnails and repeat the heading beside them, so the cards get drawn marks.
 */
export const DOMAINS = [
  {
    id: 'data',
    eyebrow: 'Data',
    title: 'Data Strategy & Analytics',
    body: 'Aggregate and harmonize data across systems that were never designed to talk to each other, then deliver real-time, actionable insight through dashboards people actually open.',
    icon: 'chart',
    points: ['Lakehouse and warehouse design', 'Cross-system harmonization', 'Executive and clinical dashboards'],
  },
  {
    id: 'automation',
    eyebrow: 'Automation',
    title: 'Intelligent Automation',
    body: 'Automate the repetitive clinical and back-office work that burns out staff — reducing manual administrative effort by 30–40% so caregivers spend their hours on care instead of paperwork.',
    icon: 'cycle',
    points: ['Process discovery and mapping', 'Power Platform and RPA delivery', 'Human-in-the-loop by design'],
  },
  {
    id: 'ai',
    eyebrow: 'AI',
    title: 'AI Agents & CoPilots',
    body: 'From predictive analytics to agents for fall prevention, our R&D arm builds and ships models into live care settings — generative AI, LLM fine-tuning and copilots that hold up under real operational load.',
    icon: 'spark',
    points: ['Applied LLM and agent engineering', 'Predictive and risk models', 'Evaluation before deployment'],
  },
] as const

/**
 * Culture claims, each grounded in something the company actually states
 * publicly — the careers page's "we invest in you", the "no rip-and-replace"
 * methodology, the human-first AI stance, the single-vertical focus.
 */
export const CULTURE = [
  {
    title: 'We invest in you',
    body: 'Career growth, innovative and strategic thinking, and leadership development are the stated commitment — not a perk page. You get the opportunities, tools and environment to thrive.',
  },
  {
    title: 'Human-first AI',
    body: 'We do not build AI to replace people. Every system we ship is judged on whether it gives a caregiver their time back. That principle survives contact with the roadmap.',
  },
  {
    title: 'One vertical, all in',
    body: 'We are not generalists. Senior living and post-acute care is the whole focus, so the expertise you build here compounds instead of resetting with every project.',
  },
  {
    title: 'Strategy and delivery, one team',
    body: 'The same team diagnoses, designs, implements and improves. You will not hand a deck to someone else and walk away — you see your own work run in production.',
  },
  {
    title: 'Real systems, real constraints',
    body: 'PointClickCare, MatrixCare, WellSky, UKG, CMS and MDS compliance. Working here means learning the systems that actually run the industry, not toy datasets.',
  },
  {
    title: 'Measured, not experimental',
    body: 'Practical implementations with measurable ROI. Work ships, gets instrumented, and is judged on the numbers it moves — which is why the number above says 90%.',
  },
] as const

/** Company event and team photography, used as the "Life here" mosaic. */
export const LIFE_GALLERY = [
  { src: '/careers/life/team-9.jpg', alt: 'NuAIg at the LeadingAge Pennsylvania conference' },
  { src: '/careers/life/team-2.jpg', alt: 'NuAIg team members at the company stand' },
  { src: '/careers/life/team-7.jpg', alt: 'A NuAIg session with senior living operators' },
  { src: '/careers/life/team-5.jpg', alt: 'NuAIg colleagues on the exhibition floor' },
  { src: '/careers/life/team-10.jpg', alt: 'A NuAIg colleague presenting at an industry event' },
  { src: '/careers/life/team-11.jpg', alt: 'The NuAIg team at LeadingAge Minnesota' },
  { src: '/careers/life/team-3.jpg', alt: 'NuAIg colleagues together at a conference' },
] as const

/** Public client logos from the "Trusted by leading healthcare providers" strip. */
export const CLIENT_LOGOS = [
  { src: '/careers/clients/united-methodist.png', alt: 'United Methodist Communities' },
  { src: '/careers/clients/ingleside.png', alt: 'Ingleside' },
  { src: '/careers/clients/parker.png', alt: 'Parker Health Group' },
  { src: '/careers/clients/kendal.png', alt: 'Kendal' },
  { src: '/careers/clients/acts.png', alt: 'Acts Retirement-Life Communities' },
  { src: '/careers/clients/archcare.png', alt: 'ArchCare' },
  { src: '/careers/clients/mather.jpg', alt: 'Mather' },
  { src: '/careers/clients/presbyterian.png', alt: 'Presbyterian Senior Living' },
  { src: '/careers/clients/eskaton.png', alt: 'Eskaton' },
  { src: '/careers/clients/landis.png', alt: 'Landis Communities' },
  { src: '/careers/clients/lifespace.jpg', alt: 'LifeSpace Communities' },
  { src: '/careers/clients/kintura.png', alt: 'Kintura' },
] as const

/**
 * The hiring stages a candidate sees, in the order the recruiter pipeline runs
 * them (`STATUS_STAGES` in constants.ts). Deliberately described in candidate
 * language — the dashboard's own stage names are internal vocabulary.
 */
export const HIRING_STEPS = [
  { step: '01', title: 'Apply', body: 'One page, no account. Your details, a resume, and an optional short intro video if you would rather be seen than skimmed.' },
  { step: '02', title: 'Screening', body: 'A recruiter reads every application against the role. You get a reference number the moment you submit.' },
  { step: '03', title: 'Interviews', body: 'Up to three rounds, depending on the role: craft, systems, and a conversation with the team you would join.' },
  { step: '04', title: 'Offer', body: 'A decision, the detail behind it, and a start date. No silent pipelines.' },
] as const

/** A client quote about the work itself — proof that what you build here lands. */
export const TESTIMONIAL = {
  quote:
    'Partnering with NuAIg has accelerated FellowshipLIFE’s transformation. Processes that once required hours of manual effort are now consistent, accurate, and completed in minutes.',
  name: 'Brian G. Lawrence',
  role: 'President & CEO, FellowshipLIFE',
} as const

export const OFFICE = {
  line1: '515 Plainfield Avenue, Suite 2',
  line2: 'Edison, NJ 08817',
  phone: '+1 732 243 0020',
  phoneHref: 'tel:+17322430020',
  email: 'info@nuaig.ai',
} as const

export const SOCIAL_LINKS = [
  { href: 'https://www.linkedin.com/company/nuaig/', label: 'LinkedIn' },
  { href: 'https://x.com/NuAIg_ai', label: 'X' },
  { href: 'https://www.youtube.com/@nuaig', label: 'YouTube' },
] as const

export const MAIN_SITE = 'https://www.nuaig.ai'

/**
 * Positions are recruiter-managed free text (`Positions` list), so a role's
 * domain tag has to be inferred rather than looked up. Order matters: "Data
 * Lead" must not be caught by a broader rule, and the AI test runs on word
 * boundaries so "Data Analyst" is not mistaken for an AI role.
 */
export function domainForPosition(title: string): 'Data' | 'AI' | 'Automation' | 'Team' {
  const value = title.toLowerCase()
  if (/\bautomation\b|\brpa\b|power platform/.test(value)) return 'Automation'
  if (/\bai\b|\bml\b|machine learning|\bllm\b|generative/.test(value)) return 'AI'
  if (/\bdata\b|analytics|analyst|\bbi\b/.test(value)) return 'Data'
  return 'Team'
}
