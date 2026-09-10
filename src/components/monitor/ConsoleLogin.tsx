'use client'

import { useActionState } from 'react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { signInMonitor, type LoginState } from '@/app/console/[gate]/actions'

/**
 * The console sign-in card. Deliberately plain: no product branding beyond the
 * mark, no hint of what lies behind it, no "forgot password" or account
 * creation. Username + password, checked server-side against an env-held hash.
 */
export function ConsoleLogin({ gate }: { gate: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signInMonitor, {})

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <div className="rounded-2xl border border-border bg-surface-raised p-7 shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.svg" alt="NuAIg" width={92} height={38} style={{ height: 38, width: 'auto' }} />
        <h1 className="mt-6 text-lg font-semibold text-ink">Operations access</h1>
        <p className="mt-1 text-sm text-secondary">Sign in to continue.</p>

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="gate" value={gate} />
          <Field id="username" label="Username">
            <Input id="username" name="username" autoComplete="off" autoFocus required />
          </Field>
          <Field id="password" label="Password">
            <Input id="password" name="password" type="password" autoComplete="off" required />
          </Field>

          {state.error && <Alert tone="error">{state.error}</Alert>}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
