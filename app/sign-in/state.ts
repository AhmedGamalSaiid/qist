import { OWNER_UNCONFIGURED_CODE } from '../../lib/auth/on-first-sign-in'

/**
 * The five states of screen 1 (Context Brief §3, Sign in handoff §1).
 *
 *   ready            A1  the mark and one action
 *   redirecting      A2  the hop is leaving the app (client-only; never in a URL)
 *   unauthenticated  A3  the attempt produced no session — nothing about why
 *   refused          A4  fail-closed: OWNER_EMAIL is not set on this deployment
 *   signedOut        A5  returning here after signing out
 */
export type SignInState = 'ready' | 'redirecting' | 'unauthenticated' | 'refused' | 'signedOut'

/**
 * How the screen is reached (the URL contract for `/sign-in`):
 *
 *   /sign-in                       A1
 *   /sign-in?error=<code>          A3 for every code but one
 *   /sign-in?error=OWNER_UNCONFIGURED
 *                                  A4 — the only code the screen recognises
 *   /sign-in?signed-out            A5 — the sign-out control, wherever the
 *                                  app shell places it, navigates here
 *
 * `error` is what Better Auth appends to the `errorCallbackURL` after a
 * failed OAuth callback. The screen branches on exactly one equality and
 * never surfaces the value, `error_description`, or anything derived from
 * them: an expired, a revoked, and a never-existed session — and every
 * other callback failure — are indistinguishable by design (spec FR-004).
 */
export function stateFromSearch(params: Record<string, string | string[] | undefined>): SignInState {
  const error = params.error
  if (error !== undefined) {
    return error === OWNER_UNCONFIGURED_CODE ? 'refused' : 'unauthenticated'
  }
  if ('signed-out' in params) return 'signedOut'
  return 'ready'
}
