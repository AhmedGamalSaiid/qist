import type { AppClient } from '../../db/client'
import { householdsFor, type HouseholdContext } from '../data/context'
import { MultipleHouseholdsError, NoHouseholdError, UnauthenticatedError } from '../errors'
import { createAuth, type AppEnv } from './config'
import { sessionIdentity } from './session'

/**
 * Session → single unambiguous `HouseholdContext` (T018, research.md R3).
 *
 * Household scope comes exclusively from the session user's own memberships
 * — never from anything the request supplies (spec FR-006). With this
 * feature's single-household reality: exactly one membership resolves to
 * that context; zero throws `NoHouseholdError` (provisioning is the auth
 * hook's job, never a read path's side effect); more than one throws
 * `MultipleHouseholdsError` rather than guessing which was meant.
 */
export async function requireContext(
  request: Request,
  client: AppClient,
  env: AppEnv,
): Promise<HouseholdContext> {
  const auth = createAuth(client, env)
  const identity = await sessionIdentity(request, auth)
  if (identity === null) throw new UnauthenticatedError()

  const contexts = await householdsFor(client, identity)
  if (contexts.length > 1) {
    throw new MultipleHouseholdsError(identity.userId, contexts.map((c) => c.householdId))
  }
  const context = contexts[0]
  if (context === undefined) throw new NoHouseholdError(identity.userId)
  return context
}
