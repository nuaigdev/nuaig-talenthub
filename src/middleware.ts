import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * First gate on `/recruiter/*` — a cheap presence check for the session cookie
 * so unauthenticated traffic is redirected to sign-in without spinning up a
 * page render.
 *
 * This is NOT the authorization check. Middleware cannot call Graph, so it
 * cannot consult the Recruiters list. Every recruiter page, route handler and
 * server action independently calls `requireRecruiter()` (spec.md §12), which
 * is what actually enforces access. Treat this file as a redirect convenience.
 */

const SESSION_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
]

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // The sign-in page and the auth endpoints must stay reachable while signed out.
  if (pathname.startsWith('/recruiter/signin')) {
    return NextResponse.next()
  }

  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name))
  if (hasSession) {
    return NextResponse.next()
  }

  const signInUrl = new URL('/recruiter/signin', request.url)
  signInUrl.searchParams.set('callbackUrl', `${pathname}${search}`)
  return NextResponse.redirect(signInUrl)
}

export const config = {
  matcher: ['/recruiter/:path*', '/api/recruiter/:path*'],
}
