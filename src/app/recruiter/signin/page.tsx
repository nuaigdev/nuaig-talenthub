import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/Logo'
import { MicrosoftMark } from '@/components/brand/MicrosoftMark'
import { Alert, Card } from '@/components/ui'
import { signIn } from '@/lib/auth'
import { getRecruiter } from '@/lib/recruiter-session'

/**
 * Recruiter sign-in (spec.md §3 decision 2).
 *
 * Deliberately outside the `(dashboard)` route group so it is not behind the
 * authorization gate it exists to satisfy. The distinction the copy has to make
 * is between "not signed in" and "signed in but not on the Recruiters list" —
 * the second is an admin task, not something the user can retry their way out of.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Recruiter sign in' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const raw = params.callbackUrl
  const requested = Array.isArray(raw) ? raw[0] : raw
  // Only ever return to our own dashboard — never to a caller-supplied origin.
  const callbackUrl = requested?.startsWith('/recruiter') ? requested : '/recruiter'

  const errorParam = params.error
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam

  // Someone already authorized has no reason to be here — but never bounce on a
  // request that arrived carrying an error. Something upstream just refused
  // this user, so redirecting them back into it is how a redirect loop starts.
  if (!error && (await getRecruiter())) {
    redirect(callbackUrl)
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-border bg-surface">
        <div className="flex h-16 w-full items-center px-4 sm:px-6">
          <Logo href="/recruiter" />
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md p-7">
          <h1 className="text-xl font-semibold text-ink">Recruiter sign in</h1>
          <p className="mt-1.5 text-sm text-secondary">
            Sign in with your work Microsoft account to review candidates.
          </p>

          {error && (
            <div className="mt-5">
              <Alert tone="error" title={errorTitle(error)}>
                {errorBody(error)}
              </Alert>
            </div>
          )}

          <form
            className="mt-6"
            action={async () => {
              'use server'
              await signIn('microsoft-entra-id', { redirectTo: callbackUrl })
            }}
          >
            {/* Microsoft's own sign-in button convention: their mark on a plain
                surface, not our brand colour. Recruiters recognise this shape as
                "sign in with your work account", which a blue button does not
                communicate. */}
            <button
              type="submit"
              className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-border-strong bg-white text-sm font-medium text-ink transition-colors hover:border-brand hover:bg-surface"
            >
              <MicrosoftMark />
              Sign in with Microsoft
            </button>
          </form>

          <p className="mt-5 text-xs text-muted">
            Access is managed by your administrator. If you cannot sign in, ask them to add
            you to the recruiters list.
          </p>
        </Card>
      </main>
    </div>
  )
}

function errorTitle(error: string): string {
  if (error === 'DirectoryUnavailable') return 'Could not verify your access'
  return error === 'AccessDenied' ? 'Access denied' : 'Sign-in failed'
}

function errorBody(error: string): string {
  if (error === 'DirectoryUnavailable') {
    return 'You signed in successfully, but we could not reach the recruiter directory to confirm your access. This is a temporary system issue, not a problem with your account. Please try again shortly.'
  }
  if (error === 'AccessDenied') {
    return 'Your Microsoft account signed in successfully, but it is not on the active recruiters list. Ask an administrator to add you.'
  }
  return 'We could not complete sign-in. Please try again.'
}
