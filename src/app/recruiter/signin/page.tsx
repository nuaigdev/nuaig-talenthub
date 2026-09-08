import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/brand/Logo'
import { Alert, Button, Card } from '@/components/ui'
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

  // Someone already authorized has no reason to be here.
  if (await getRecruiter()) redirect(callbackUrl)

  const errorParam = params.error
  const error = Array.isArray(errorParam) ? errorParam[0] : errorParam

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
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
            <Button type="submit" className="w-full">
              Sign in with Microsoft
            </Button>
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
  return error === 'AccessDenied' ? 'Access denied' : 'Sign-in failed'
}

function errorBody(error: string): string {
  if (error === 'AccessDenied') {
    return 'Your Microsoft account signed in successfully, but it is not on the active recruiters list. Ask an administrator to add you.'
  }
  return 'We could not complete sign-in. Please try again.'
}
