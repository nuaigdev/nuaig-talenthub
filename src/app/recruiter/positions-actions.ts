'use server'

import { revalidatePath } from 'next/cache'
import { requireRecruiter } from '@/lib/recruiter-session'
import { addPosition, allPositions, setPositionActive, type PositionRecord } from '@/lib/graph/positions'
import { publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Recruiter management of the open positions list.
 *
 * Like every server action these re-authorize from scratch — a server action is
 * a public endpoint whatever rendered it (§12).
 *
 * Both actions return the list as it stands *after* the write, so the screen
 * updates from the write's own result. Relying on `revalidatePath` alone was
 * not enough: the re-render can be served by a different instance, and the
 * recruiter would be left looking at a stale table until a hard refresh.
 * `revalidatePath` is still called so the server-rendered copy agrees on the
 * next navigation.
 *
 * Positions are deactivated, never deleted. A candidate who applied for a role
 * keeps that role on their record, so removing the row would leave their
 * history referring to something that no longer exists.
 */

export type PositionActionResult =
  | { ok: true; positions: PositionRecord[] }
  | { ok: false; error: string }

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
    return { ok: true, positions: await allPositions() }
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
    return { ok: true, positions: await allPositions() }
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
