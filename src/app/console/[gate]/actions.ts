'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  endSession,
  establishSession,
  gateMatches,
  monitorConfigured,
  verifyCredentials,
} from '@/lib/monitor'
import { enforceRateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

/**
 * Console sign-in / sign-out.
 *
 * The gate is re-validated here (a server action is a public endpoint, not
 * covered by the layout). Login is rate-limited per client IP, and a wrong
 * username and a wrong password fail identically so neither can be enumerated.
 */

export type LoginState = { error?: string }

export async function signInMonitor(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const gate = String(formData.get('gate') ?? '')
  if (!monitorConfigured() || !gateMatches(gate)) return { error: 'This page is unavailable.' }

  const ip =
    (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ||
    (await headers()).get('x-real-ip') ||
    'unknown'

  try {
    enforceRateLimit('monitor-login', [ip], { limit: 8, windowMs: 10 * 60_000 })
  } catch {
    logger.warn('Operations console login throttled', { operation: 'monitor_login', category: 'RATE_LIMITED' })
    return { error: 'Too many attempts. Please wait a few minutes and try again.' }
  }

  const username = String(formData.get('username') ?? '')
  const password = String(formData.get('password') ?? '')

  if (!verifyCredentials(username, password)) {
    logger.warn('Operations console login failed', { operation: 'monitor_login', category: 'AUTH_DENIED' })
    return { error: 'Incorrect username or password.' }
  }

  await establishSession()
  logger.info('Operations console login', { operation: 'monitor_login' })
  redirect(`/console/${gate}`)
}

export async function signOutMonitor(gate: string): Promise<void> {
  await endSession()
  redirect(`/console/${gate}`)
}
