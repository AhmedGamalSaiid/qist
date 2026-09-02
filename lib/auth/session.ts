import type { Identity } from '../data/context'
import type { Auth } from './config'

/**
 * The sole producer of `Identity` in the application (T017, spec FR-006).
 *
 * Verifies the Better Auth session cookie on `request` and returns the
 * foundation's `Identity { userId }`, or `null` for no session, an expired
 * session, or a revoked one — all three answer identically (spec FR-004),
 * because a caller must never be able to distinguish "no session" from
 * "a session that used to work".
 */
export async function sessionIdentity(request: Request, auth: Auth): Promise<Identity | null> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (session === null) return null
  return { userId: session.user.id }
}
