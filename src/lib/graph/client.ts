import 'server-only'
import { Client, type AuthProviderCallback, type GraphError } from '@microsoft/microsoft-graph-client'
import { graphEnv } from '../env'
import { AppError, type ErrorCategory } from '../errors'

/**
 * Graph client construction for both auth modes (spec.md §2).
 *
 *   appOnlyClient()   — client-credentials daemon flow. Everything the public
 *                       candidate portal does runs through this, because there
 *                       is no signed-in user to act as. How far its SharePoint
 *                       reach extends is a property of the app registration,
 *                       not of this code — see SETUP.md.
 *
 *   delegatedClient() — acts as the signed-in recruiter, for reads where their
 *                       own identity should apply.
 *
 * Neither client, nor any token either produces, may cross into a client
 * component. The one exception in the whole app is the upload-session URL
 * (see graph/drive.ts), which is a capability URL, not a token.
 */

const TOKEN_ENDPOINT = (tenantId: string) =>
  `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'

/** Refresh this many ms before actual expiry so an in-flight call can't age out. */
const EXPIRY_SKEW_MS = 60_000

type CachedToken = { value: string; expiresAt: number }

// Module-scoped, so a warm serverless instance reuses the token across requests
// instead of hitting the token endpoint on every submission.
let cachedAppToken: CachedToken | null = null
let inFlight: Promise<string> | null = null

async function fetchAppOnlyToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: graphEnv.clientId,
    client_secret: graphEnv.clientSecret,
    scope: GRAPH_SCOPE,
    grant_type: 'client_credentials',
  })

  const response = await fetch(TOKEN_ENDPOINT(graphEnv.tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })

  if (!response.ok) {
    // The response body can echo the client_id but never the secret; even so we
    // only keep the error code, not the raw payload.
    const payload = (await response.json().catch(() => ({}))) as { error?: string }
    throw new AppError(
      'GRAPH_UNAVAILABLE',
      `Token request failed: ${response.status} ${payload.error ?? 'unknown_error'}`,
    )
  }

  const payload = (await response.json()) as { access_token: string; expires_in: number }
  cachedAppToken = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000 - EXPIRY_SKEW_MS,
  }
  return payload.access_token
}

export async function getAppOnlyToken(): Promise<string> {
  if (cachedAppToken && cachedAppToken.expiresAt > Date.now()) {
    return cachedAppToken.value
  }
  // Collapse concurrent misses onto one token request.
  if (!inFlight) {
    inFlight = fetchAppOnlyToken().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

export function appOnlyClient(): Client {
  return Client.init({
    defaultVersion: 'v1.0',
    authProvider: (done: AuthProviderCallback) => {
      getAppOnlyToken().then(
        (token) => done(null, token),
        (error) => done(error, null),
      )
    },
  })
}

export function delegatedClient(accessToken: string): Client {
  return Client.init({
    defaultVersion: 'v1.0',
    authProvider: (done: AuthProviderCallback) => done(null, accessToken),
  })
}

type GraphErrorish = Partial<GraphError> & {
  statusCode?: number
  code?: string
  requestId?: string
  body?: unknown
}

export function graphStatus(error: unknown): number | undefined {
  return (error as GraphErrorish)?.statusCode
}

/** Graph's request id — the one value Microsoft support will ask for. */
export function graphCorrelationId(error: unknown): string | undefined {
  return (error as GraphErrorish)?.requestId
}

export function isPreconditionFailed(error: unknown): boolean {
  return graphStatus(error) === 412
}

export function isNotFound(error: unknown): boolean {
  return graphStatus(error) === 404
}

/**
 * Wraps a Graph failure in an AppError carrying the correlation id, so §13's
 * logging requirement is satisfied without the caller unpacking SDK internals.
 */
export function wrapGraphError(
  error: unknown,
  category: ErrorCategory,
  operation: string,
): AppError {
  if (error instanceof AppError) return error
  const status = graphStatus(error)
  const code = (error as GraphErrorish)?.code
  return new AppError(category, `${operation} failed: ${status ?? '?'} ${code ?? 'unknown'}`, {
    context: { correlationId: graphCorrelationId(error), graphStatus: status, graphCode: code },
    cause: error,
  })
}
