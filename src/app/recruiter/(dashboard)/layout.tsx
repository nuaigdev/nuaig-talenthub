import { redirect } from 'next/navigation'
import { RecruiterHeader } from '@/components/recruiter/RecruiterHeader'
import { getRecruiter } from '@/lib/recruiter-session'
import { signOut } from '@/lib/auth'

/**
 * Authorization gate for the whole dashboard (spec.md §12).
 *
 * Middleware already bounced requests with no session cookie, but that check is
 * only a cookie-presence test. This is where the signed-in identity is actually
 * validated against the `Recruiters` list, on every request, before any page
 * below renders. Individual pages and actions still re-check — layouts are not
 * a security boundary for server actions.
 */
export default async function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const recruiter = await getRecruiter()

  if (!recruiter) {
    redirect('/recruiter/signin?error=AccessDenied')
  }

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
