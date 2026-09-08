'use server'

import { revalidatePath } from 'next/cache'
import { requireRecruiter } from '@/lib/recruiter-session'
import { addPosition, setPositionActive } from '@/lib/graph/positions'
import { publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Recruiter management of the open positions list.
 *
 * Like every server action these re-authorize from scratch — a server action is
 * a public endpoint whatever rendered it (§12).
 *
 * Positions are deactivated, never deleted. A candidate who applied for a role
 * keeps that role on their record, so removing the row would leave their
 * history referring to something that no longer exists.
 */

export type PositionActionResult = { ok: true } | { ok: false; error: string }

export async function addPositionAction(formData: FormData): Promise<PositionActionResult> {
  try {
    const recruiter = await requireRecruiter()

    const raw = String(formData.get('title') ?? '').trim()
    if (!raw) return { ok: false, error: 'Enter a position name.' }
    if (raw.length > 150) return { ok: false, error: 'That position name is too long.' }

    await addPosition(raw)

    logger.info('Position added', {
      operation: 'add_position',
      position: raw,
      actor: recruiter.email,
    })

    revalidatePath('/recruiter/positions')
    return { ok: true }
  } catch (error) {
    const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
    logger.error('Failed to add position', appError, {
      operation: 'add_position',
      category: appError.category,
    })
    return { ok: false, error: publicMessageFor(appError) }
  }
}

export async function setPositionActiveAction(
  itemId: string,
  active: boolean,
): Promise<PositionActionResult> {
  try {
    const recruiter = await requireRecruiter()
    await setPositionActive(itemId, active)

    logger.info('Position availability changed', {
      operation: 'set_position_active',
      itemId,
      active,
      actor: recruiter.email,
    })

    revalidatePath('/recruiter/positions')
    return { ok: true }
  } catch (error) {
    const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
    logger.error('Failed to change position availability', appError, {
      operation: 'set_position_active',
      category: appError.category,
      itemId,
    })
    return { ok: false, error: publicMessageFor(appError) }
  }
}
