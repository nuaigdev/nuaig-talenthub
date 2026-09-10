'use server'

import { revalidatePath } from 'next/cache'
import { requireRecruiter, type RecruiterIdentity } from '@/lib/recruiter-session'
import {
  addHiringManager,
  addPosition,
  canManageRoster,
  positionsForViewer,
  removeHiringManager,
  setPositionActive,
  setPositionOwner,
  type PositionRecord,
} from '@/lib/graph/positions'
import { isActiveRecruiter } from '@/lib/graph/recruiters'
import { AppError, publicMessageFor, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * Recruiter management of positions and their hiring-manager rosters.
 *
 * Like every server action these re-authorize from scratch — a server action is
 * a public endpoint whatever rendered it (§12) — and each returns the list as it
 * stands *after* the write, scoped to the caller (an admin sees every position;
 * a recruiter only the ones they manage), so the screen updates from the write's
 * own result rather than a possibly-stale route refresh.
 *
 * Roster changes are owner-or-admin only: `canManageRoster` gates add, remove,
 * owner assignment and open/close. The owner can never be removed, and a manager
 * added must be an active recruiter — both enforced below and in the data layer.
 */

export type PositionActionResult =
  | { ok: true; positions: PositionRecord[] }
  | { ok: false; error: string }

function viewerOf(recruiter: RecruiterIdentity) {
  return { email: recruiter.email, isAdmin: recruiter.isAdmin }
}

/** Rejects a roster change the caller is not the owner/admin for. */
async function assertCanManage(recruiter: RecruiterIdentity, itemId: string): Promise<void> {
  if (!(await canManageRoster(itemId, viewerOf(recruiter)))) {
    throw new AppError('AUTH_DENIED', `${recruiter.email} may not manage position ${itemId}`, {
      publicMessage: 'Only the position owner can change this.',
    })
  }
}

export async function addPositionAction(formData: FormData): Promise<PositionActionResult> {
  try {
    const recruiter = await requireRecruiter()

    const raw = String(formData.get('title') ?? '').trim()
    if (!raw) return { ok: false, error: 'Enter a position name.' }
    if (raw.length > 150) return { ok: false, error: 'That position name is too long.' }

    // The creator owns the position and is its first hiring manager.
    await addPosition(raw, recruiter.email)

    logger.info('Position added', { operation: 'add_position', position: raw, actor: recruiter.email })

    revalidatePath('/recruiter/positions')
    return { ok: true, positions: await positionsForViewer(viewerOf(recruiter)) }
  } catch (error) {
    return failure(error, 'add_position')
  }
}

export async function setPositionActiveAction(
  itemId: string,
  active: boolean,
): Promise<PositionActionResult> {
  try {
    const recruiter = await requireRecruiter()
    await assertCanManage(recruiter, itemId)
    await setPositionActive(itemId, active)

    logger.info('Position availability changed', {
      operation: 'set_position_active',
      itemId,
      active,
      actor: recruiter.email,
    })

    revalidatePath('/recruiter/positions')
    return { ok: true, positions: await positionsForViewer(viewerOf(recruiter)) }
  } catch (error) {
    return failure(error, 'set_position_active')
  }
}

export async function addHiringManagerAction(
  itemId: string,
  email: string,
): Promise<PositionActionResult> {
  try {
    const recruiter = await requireRecruiter()
    await assertCanManage(recruiter, itemId)

    const clean = email.trim().toLowerCase()
    if (!clean) return { ok: false, error: 'Choose a recruiter to add.' }
    // Hiring managers must come from the recruiters roster (spec).
    if (!(await isActiveRecruiter(clean))) {
      return { ok: false, error: 'That person is not an active recruiter.' }
    }

    await addHiringManager(itemId, clean)

    logger.info('Hiring manager added', {
      operation: 'add_hiring_manager',
      itemId,
      added: clean,
      actor: recruiter.email,
    })

    revalidatePath('/recruiter/positions')
    return { ok: true, positions: await positionsForViewer(viewerOf(recruiter)) }
  } catch (error) {
    return failure(error, 'add_hiring_manager')
  }
}

export async function removeHiringManagerAction(
  itemId: string,
  email: string,
): Promise<PositionActionResult> {
  try {
    const recruiter = await requireRecruiter()
    await assertCanManage(recruiter, itemId)

    await removeHiringManager(itemId, email)

    logger.info('Hiring manager removed', {
      operation: 'remove_hiring_manager',
      itemId,
      removed: email.trim().toLowerCase(),
      actor: recruiter.email,
    })

    revalidatePath('/recruiter/positions')
    return { ok: true, positions: await positionsForViewer(viewerOf(recruiter)) }
  } catch (error) {
    return failure(error, 'remove_hiring_manager')
  }
}

/**
 * Assigns (or reassigns) a position's owner. Admin-only: it is the tool for
 * bootstrapping legacy rows that predate ownership, and for handing a position
 * to a different owner. A normal recruiter never needs it — they own what they
 * create.
 */
export async function setPositionOwnerAction(
  itemId: string,
  email: string,
): Promise<PositionActionResult> {
  try {
    const recruiter = await requireRecruiter()
    if (!recruiter.isAdmin) {
      return { ok: false, error: 'Only an admin can assign a position owner.' }
    }

    const clean = email.trim().toLowerCase()
    if (!(await isActiveRecruiter(clean))) {
      return { ok: false, error: 'That person is not an active recruiter.' }
    }

    await setPositionOwner(itemId, clean)

    logger.info('Position owner assigned', {
      operation: 'set_position_owner',
      itemId,
      owner: clean,
      actor: recruiter.email,
    })

    revalidatePath('/recruiter/positions')
    return { ok: true, positions: await positionsForViewer(viewerOf(recruiter)) }
  } catch (error) {
    return failure(error, 'set_position_owner')
  }
}

function failure(error: unknown, operation: string): PositionActionResult {
  const appError = toAppError(error, 'GRAPH_UNAVAILABLE')
  logger.error(`Position action failed: ${operation}`, appError, {
    operation,
    category: appError.category,
  })
  return { ok: false, error: publicMessageFor(appError) }
}
