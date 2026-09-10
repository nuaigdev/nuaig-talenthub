import type { Metadata } from 'next'
import { requireRecruiter } from '@/lib/recruiter-session'
import { positionsForViewer, positionsListConfigured } from '@/lib/graph/positions'
import { listActiveRecruiters } from '@/lib/graph/recruiters'
import { PositionsManager } from '@/components/recruiter/PositionsManager'
import { Alert } from '@/components/ui'
import { logger } from '@/lib/logger'
import { publicMessageFor, toAppError } from '@/lib/errors'

/**
 * Recruiter-managed open positions.
 *
 * Positions used to be a hardcoded list, so opening a new role meant a code
 * change and a deploy. They are rows in a SharePoint list now, edited here.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Positions' }

export default async function PositionsPage() {
  const recruiter = await requireRecruiter()

  try {
    const viewer = { email: recruiter.email, isAdmin: recruiter.isAdmin }
    const [positions, roster] = await Promise.all([
      // A recruiter sees only the positions they are on; an admin sees all.
      positionsForViewer(viewer),
      listActiveRecruiters(),
    ])
    // The picker only needs identity, never the role/active flags.
    const recruiters = roster.map((r) => ({ email: r.email, displayName: r.displayName }))

    return (
      <div className="w-full px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-ink">Positions</h1>
          <p className="mt-0.5 text-sm text-secondary">
            {recruiter.isAdmin
              ? 'Every position, and who is on each hiring team. Changes take effect within a minute.'
              : 'The positions you own or help hire for. Changes take effect within a minute.'}
          </p>
        </div>

        <PositionsManager
          positions={positions}
          configured={positionsListConfigured()}
          viewerEmail={recruiter.email}
          viewerIsAdmin={recruiter.isAdmin}
          recruiters={recruiters}
        />
      </div>
    )
  } catch (error) {
    const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
    logger.error('Positions page load failed', appError, {
      operation: 'load_positions',
      category: appError.category,
    })

    return (
      <div className="w-full max-w-3xl px-4 py-12 sm:px-6">
        <Alert tone="error" title="Could not load positions">
          {publicMessageFor(appError)}
        </Alert>
      </div>
    )
  }
}
