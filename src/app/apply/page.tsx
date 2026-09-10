import type { Metadata } from 'next'
import { ApplyWizard } from '@/components/apply/ApplyWizard'
import { uploadEnv } from '@/lib/env'
import { ogImage, siteName, siteUrl } from '@/lib/site'
import { activePositions } from '@/lib/graph/positions'

/**
 * The public application entry point — no authentication of any kind (spec.md §1).
 *
 * This is a server component purely so the configured upload limits reach the
 * client as props. That keeps the limits in one place (server env) instead of
 * duplicating them into `NEXT_PUBLIC_*` variables, and the values are not
 * secret — they are the same numbers the server enforces.
 */

const applyDescription =
  'Submit your application to join NuAIg — one short form, no account needed.'

/**
 * `openGraph` and `twitter` are restated in full rather than inherited: Next
 * merges metadata one level deep, so declaring either key here would otherwise
 * drop the root layout's preview image entirely.
 */
export const metadata: Metadata = {
  title: 'Apply',
  description: applyDescription,
  // `/` 307s here, so this is the canonical address of the form.
  alternates: { canonical: '/apply' },
  openGraph: {
    type: 'website',
    siteName,
    title: 'Apply · Careers at NuAIg',
    description: applyDescription,
    url: `${siteUrl}/apply`,
    locale: 'en_US',
    images: [ogImage],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Apply · Careers at NuAIg',
    description: applyDescription,
    images: [ogImage.url],
  },
}

/**
 * Rendered per request rather than prerendered, so the configured upload limits
 * are read from the live environment. Prerendering would bake whatever values
 * were present at build time into the client bundle.
 */
export const dynamic = 'force-dynamic'

export default async function ApplyPage() {
  // Positions come from the recruiter-managed list, with a built-in fallback if
  // that list is unreachable — the public form must render regardless.
  const positions = await activePositions()

  return (
    <ApplyWizard
      positions={positions}
      limits={{
        maxResumeBytes: uploadEnv.maxResumeBytes,
        maxVideoBytes: uploadEnv.maxVideoBytes,
        resumeTypes: uploadEnv.allowedResumeTypes,
        videoTypes: uploadEnv.allowedVideoTypes,
      }}
    />
  )
}
