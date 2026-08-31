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
