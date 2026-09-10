import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { gateMatches, monitorConfigured } from '@/lib/monitor'

/**
 * The operations console shell.
 *
 * The whole subtree is reachable only at the secret URL segment held in the
 * environment. If the console is unconfigured, or the segment is wrong, this
 * 404s — indistinguishable from any other missing page, so its existence is not
 * inferable. Individual actions and the document route re-check the gate too,
 * since a layout is not a boundary for a directly-posted request.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Operations',
  robots: { index: false, follow: false },
}

type Params = Promise<{ gate: string }>

export default async function ConsoleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Params
}) {
  const { gate } = await params
  if (!monitorConfigured() || !gateMatches(gate)) notFound()

  return <div className="min-h-screen bg-surface">{children}</div>
}
