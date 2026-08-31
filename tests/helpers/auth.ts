import { createHmac } from 'node:crypto'
import type { AppClient } from '../../db/client'
import { authSessions } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import type { HouseholdContext } from '../../lib/data/context'
import type { AppEnv } from '../../lib/auth/config'
import { seedHousehold } from './households'

/**
 * Test-only auth helpers (research.md R12).
 *
 * Better Auth's own OAuth code is not under test here — Google's endpoints
 * are never called. Our seam is the session and the after-create hook: a
 * session row is inserted directly (or produced by driving `onFirstSignIn`),
 * and these helpers construct the same **signed** cookie value Better Auth's
 * real `auth.api.getSession` verification path expects, so tests exercise
 * that real verification code against a real database row.
 *
 * The signing scheme (HMAC-SHA256 over the raw token, `value.signature`,
 * URI-encoded) is `better-call`'s `signCookieValue`
 * (`node_modules/better-call/dist/crypto.mjs`), the library Better Auth's
 * endpoint context uses for `ctx.setSignedCookie` / `ctx.getSignedCookie`.
 */

export const TEST_AUTH_ENV: AppEnv = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
  OWNER_EMAIL: null,
}

export function signSessionCookieValue(token: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(token).digest('base64')
  return encodeURIComponent(`${token}.${signature}`)
}

/** A `Cookie` header value carrying a validly-signed session token. */
export function sessionCookieHeader(token: string, env: AppEnv = TEST_AUTH_ENV): string {
  return `better-auth.session_token=${signSessionCookieValue(token, env.BETTER_AUTH_SECRET)}`
}

/**
 * Seeds a household + owner user + a live, non-expired session row, and
 * returns the `Cookie` header a contract test passes on `Request`s to act as
 * that user.
 */
export async function signedInHousehold(
  client: AppClient,
  options: { householdId: string; userId: string; email: string; sessionToken: string; at?: number },
): Promise<{ context: HouseholdContext; cookie: string }> {
  const context = await seedHousehold(client, {
    id: options.householdId,
    userId: options.userId,
    email: options.email,
    at: options.at,
  })

  await atomically(client, [
    client.db.insert(authSessions).values({
      id: `SESS-${options.sessionToken}`,
      userId: options.userId,
      token: options.sessionToken,
      expiresAt: new Date(Date.now() + 999_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(Date.now()),
      updatedAt: new Date(Date.now()),
    }) as never,
  ])

  return { context, cookie: sessionCookieHeader(options.sessionToken) }
}
