import NextAuth, { type DefaultSession } from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import { findActiveRecruiter, invalidateRecruiterCache } from './graph/recruiters'
import { logger } from './logger'

/**
 * Recruiter authentication — Entra ID SSO (spec.md §2, §3 decision 2).
 *
 * Authentication and authorization are separate on purpose:
 *   - Entra ID establishes identity.
 *   - The `Recruiters` SharePoint list decides access, checked in `signIn`
 *     below *and* again on every request via `requireRecruiter()`. Sign-in
 *     alone is not a durable grant: a recruiter deactivated mid-session loses
 *     access on their next request, not at token expiry.
 *
 * Graph scopes are intentionally minimal (`openid profile email`). We do *not*
 * request delegated SharePoint scopes: `Sites.Selected` is an application
 * permission, and §12 requires that recruiters cannot reach SharePoint
 * directly. Every list read and write therefore runs app-only with the
 * recruiter's identity recorded in the append-only audit trail — the fallback
 * §2 anticipates.
 */

declare module 'next-auth' {
  interface Session {
    user: {
      /** Verified Entra email; the key against the Recruiters list. */
      email: string
      displayName: string
    } & DefaultSession['user']
  }
}

function entraIssuer(): string {
  const tenantId = process.env.MICROSOFT_TENANT_ID
  return `https://login.microsoftonline.com/${tenantId}/v2.0`
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: {
    signIn: '/recruiter/signin',
    error: '/recruiter/signin',
  },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      issuer: entraIssuer(),
      authorization: { params: { scope: 'openid profile email' } },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      // Entra puts the UPN in `preferred_username`; `email` is only present for
      // accounts that have one set, so fall back deliberately.
      const email =
        (profile?.email as string | undefined) ??
        (profile?.preferred_username as string | undefined) ??
        ''

      // Being unable to *read* the roster is not the same as being absent from
      // it. Telling someone they aren't a recruiter when the directory is
      // simply unreachable sends them to an admin to fix the wrong problem.
      let recruiter: Awaited<ReturnType<typeof findActiveRecruiter>>
      try {
        // A stale negative cache entry would lock out a just-added recruiter,
        // so a failed lookup is retried once against fresh data.
        recruiter = await findActiveRecruiter(email)
        if (!recruiter) {
          invalidateRecruiterCache()
          recruiter = await findActiveRecruiter(email)
        }
      } catch (error) {
        logger.error('Recruiter roster unreachable during sign-in', error, {
          operation: 'recruiter_sign_in',
          category: 'GRAPH_UNAVAILABLE',
          email,
        })
        return '/recruiter/signin?error=DirectoryUnavailable'
      }

      if (!recruiter) {
        logger.warn('Sign-in denied: not an active recruiter', {
          operation: 'recruiter_sign_in',
          category: 'AUTH_DENIED',
          email,
        })
        return false
      }

      logger.info('Recruiter signed in', { operation: 'recruiter_sign_in', email })
      return true
    },

    async jwt({ token, profile }) {
      if (profile) {
        token.email =
          (profile.email as string | undefined) ??
          (profile.preferred_username as string | undefined) ??
          token.email
        token.name = (profile.name as string | undefined) ?? token.name
      }
      return token
    },

    async session({ session, token }) {
      session.user.email = (token.email as string) ?? ''
      session.user.displayName = (token.name as string) ?? session.user.email
      return session
    },
  },
})
