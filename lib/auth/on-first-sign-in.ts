import { APIError } from 'better-auth/api'
import type { AppClient } from '../../db/client'
import { claimMigratedHousehold, findUnclaimedMigratedHouseholdId, provisionHousehold } from '../data/provisioning'
import { OwnerUnconfiguredError } from '../errors'

/**
 * The before-create fail-closed guard (T028, research.md R4).
 *
 * Called from `createAuth`'s `databaseHooks.user.create.before`, ahead of
 * every new user's insertion. If the database holds an unclaimed migrated
 * household and no operator-designated owner is configured, sign-in is
 * refused before anything is persisted — no user, session, household, or
 * audit row — rather than silently provisioning a household that would
 * later compete with the migrated one. Inert on deployments with no
 * unclaimed migrated household regardless of `ownerEmail`.
 */
export async function assertSignInAllowed(client: AppClient, ownerEmail: string | null): Promise<void> {
  if (ownerEmail !== null) return
  if ((await findUnclaimedMigratedHouseholdId(client)) !== null) {
    throw new OwnerUnconfiguredError()
  }
}

/**
 * The one error code the sign-in screen is allowed to recognise.
 *
 * Better Auth's OAuth callback rethrows an `APIError` from the user-create
 * hook and redirects to the client's `errorCallbackURL` as
 * `?error=<code>&error_description=<message>`; a plain `Error` is swallowed
 * into the generic `unable_to_create_user`, which a database fault could
 * also produce. The fail-closed refusal (A4) is the only state whose reader
 * is the administrator and the only one that names a cause, so it — and
 * only it — travels under a dedicated code. Every other value the callback
 * can carry renders as A3, which by design says nothing about why
 * (spec FR-004, Sign in handoff §1.4).
 */
export const OWNER_UNCONFIGURED_CODE = 'OWNER_UNCONFIGURED'

/**
 * `assertSignInAllowed`, translated for Better Auth's hook boundary: the
 * foundation's typed `OwnerUnconfiguredError` becomes the `APIError` Better
 * Auth propagates to the browser under `OWNER_UNCONFIGURED_CODE`. Nothing
 * else is translated — any other failure stays whatever it was.
 */
export async function refuseIfSignInClosed(client: AppClient, ownerEmail: string | null): Promise<void> {
  try {
    await assertSignInAllowed(client, ownerEmail)
  } catch (error) {
    if (error instanceof OwnerUnconfiguredError) {
      throw new APIError('FORBIDDEN', {
        code: OWNER_UNCONFIGURED_CODE,
        message: 'Sign-in is closed until OWNER_EMAIL is set.',
      })
    }
    throw error
  }
}

/**
 * The Better Auth user-creation hook body (T020/T028, research.md R4).
 *
 * Branches on operator configuration: the verified email of the
 * operator-designated owner claims the (still-unclaimed) migrated
 * household; every other first sign-in provisions a fresh one. The
 * fail-closed guard above has already run by the time this fires, so a
 * user only ever reaches here when provisioning or claiming is the correct
 * outcome.
 */
export interface OnFirstSignInInput {
  readonly userId: string
  readonly email: string
  readonly emailVerified: boolean
  readonly ownerEmail: string | null
  readonly ids: {
    readonly householdId: string
    readonly membershipId: string
    readonly auditId: string
  }
  readonly at: number
}

export async function onFirstSignIn(
  client: AppClient,
  input: OnFirstSignInInput,
): Promise<'provisioned' | 'claimed'> {
  if (input.emailVerified && input.ownerEmail !== null && input.email === input.ownerEmail) {
    const migratedHouseholdId = await findUnclaimedMigratedHouseholdId(client)
    if (migratedHouseholdId !== null) {
      await claimMigratedHousehold(client, {
        migratedHouseholdId,
        newOwnerUserId: input.userId,
        ids: { auditId: input.ids.auditId },
        at: input.at,
      })
      return 'claimed'
    }
  }

  await provisionHousehold(client, {
    userId: input.userId,
    householdName: `${input.email}'s household`,
    ids: input.ids,
    at: input.at,
  })
  return 'provisioned'
}
