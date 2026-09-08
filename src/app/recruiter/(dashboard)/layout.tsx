import { redirect } from 'next/navigation'
import { RecruiterHeader } from '@/components/recruiter/RecruiterHeader'
import { getRecruiterState } from '@/lib/recruiter-session'
import { signOut } from '@/lib/auth'

/**
 * The single authorization gate for the dashboard (spec.md §12).
 *
 * This runs on every request below `/recruiter`, validating the signed-in
 * identity against the `Recruiters` list before any page renders.
 *
 * There is deliberately no middleware in front of it. An earlier version had
 * middleware redirect on a missing session cookie as a render-saving
 * optimisation, but it tested for an exact cookie name — and Auth.js splits a
 * large session token across numbered chunk cookies, which Entra's claim-heavy
 * tokens routinely trigger. Middleware then saw no session while `auth()` here
 * saw a valid one, and the two bounced the user between them forever. One
 * redirect authority, reading the session through `auth()`, is the fix.
 *
 * Individual pages and server actions still re-check: a layout is not a
 * security boundary for a server action, which is a public endpoint.
 */
export default async function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const result = await getRecruiterState()

  // Not signed in at all: send them to sign in, remembering where they wanted
  // to go. This is not a denial and must not be dressed up as one.
  if (result.state === 'anonymous') {
    redirect('/recruiter/signin')
  }

  // Signed in, but not on the roster — that needs an administrator, not a retry.
  if (result.state === 'unauthorized') {
    redirect('/recruiter/signin?error=AccessDenied')
  }

  const recruiter = result.recruiter

  async function signOutAction() {
    'use server'
    await signOut({ redirectTo: '/recruiter/signin' })
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <RecruiterHeader
        displayName={recruiter.displayName}
        email={recruiter.email}
        signOutAction={signOutAction}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  )
}
