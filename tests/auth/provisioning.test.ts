import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { auditLog, households, memberships, users } from '../../db/schema/index'
import { assertSignInAllowed, onFirstSignIn } from '../../lib/auth/on-first-sign-in'
import { atomically } from '../../lib/data/atomically'
import { provisionHousehold } from '../../lib/data/index'
import { OwnerUnconfiguredError, ProvisioningConflictError } from '../../lib/errors'
import { createTestDatabase, type TestDatabase } from '../helpers/db'

/**
 * T024 — first sign-in provisions household + owner membership + audit in
 * one atom, all-or-nothing on both drivers (spec FR-005); idempotent per
 * user (contracts/data-layer.md).
 *
 * `onFirstSignIn`'s hook wiring fires only on Better Auth's `user.create`
 * lifecycle event — never on a returning user's profile update — which is
 * what structurally prevents a Google profile rename/picture change from
 * ever provisioning a second household: the hook this test drives simply
 * never runs again for an existing user. Better Auth's own account-linking
 * (matching a returning sign-in to the same user by (issuer, account_id))
 * is its own tested code, not exercised here (research.md R12).
 */

const AT = 1_787_000_000_000

describe('onFirstSignIn (US1 provision branch)', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('provisions a household, owner membership, and audit entry in one atom', async () => {
    database = await createTestDatabase()
    const client = database.client

    await atomically(client, [
      client.db.insert(users).values({
        id: 'UPROV000000000000000000AA',
        email: 'new@household.example',
        name: 'New Owner',
        image: null,
        createdAt: AT,
      }) as never,
    ])

    const outcome = await onFirstSignIn(client, {
      userId: 'UPROV000000000000000000AA',
      email: 'new@household.example',
      emailVerified: true,
      ownerEmail: null,
      ids: {
        householdId: 'HPROV000000000000000000AA',
        membershipId: 'MPROV000000000000000000AA',
        auditId: 'APROV000000000000000000AA',
      },
      at: AT,
    })

    expect(outcome).toBe('provisioned')

    const householdRows = await client.db.select().from(households)
    expect(householdRows).toHaveLength(1)
    expect(householdRows[0]?.id).toBe('HPROV000000000000000000AA')

    const membershipRows = await client.db.select().from(memberships)
    expect(membershipRows).toHaveLength(1)
    expect(membershipRows[0]).toMatchObject({
      householdId: 'HPROV000000000000000000AA',
      userId: 'UPROV000000000000000000AA',
      role: 'owner',
    })

    const auditRows = await client.db.select().from(auditLog)
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0]).toMatchObject({
      householdId: 'HPROV000000000000000000AA',
      actorId: 'UPROV000000000000000000AA',
      actorKind: 'user',
      action: 'create',
      entity: 'household',
      entityId: 'HPROV000000000000000000AA',
    })
  })

  it('refuses a second provisioning for a user who already holds a membership, writing nothing', async () => {
    database = await createTestDatabase()
    const client = database.client

    await atomically(client, [
      client.db.insert(users).values({
        id: 'UTWICE00000000000000000AA',
        email: 'twice@household.example',
        name: null,
        image: null,
        createdAt: AT,
      }) as never,
    ])

    await provisionHousehold(client, {
      userId: 'UTWICE00000000000000000AA',
      householdName: 'First',
      ids: {
        householdId: 'HTWICE00000000000000000AA',
        membershipId: 'MTWICE00000000000000000AA',
        auditId: 'ATWICE00000000000000000AA',
      },
      at: AT,
    })

    await expect(
      provisionHousehold(client, {
        userId: 'UTWICE00000000000000000AA',
        householdName: 'Second',
        ids: {
          householdId: 'HTWICE00000000000000000BB',
          membershipId: 'MTWICE00000000000000000BB',
          auditId: 'ATWICE00000000000000000BB',
        },
        at: AT + 1,
      }),
    ).rejects.toThrow(ProvisioningConflictError)

    // Exactly the first household exists — the refused attempt wrote nothing.
    expect(await client.db.select().from(households)).toHaveLength(1)
    expect(await client.db.select().from(memberships)).toHaveLength(1)
    expect(await client.db.select().from(auditLog)).toHaveLength(1)
  })

  it('is all-or-nothing: a colliding household id fails the whole atom on both drivers', async () => {
    database = await createTestDatabase()
    const client = database.client

    await atomically(client, [
      client.db.insert(users).values({
        id: 'UCOLL0000000000000000000A',
        email: 'a@collide.example',
        name: null,
        image: null,
        createdAt: AT,
      }) as never,
      client.db.insert(users).values({
        id: 'UCOLL0000000000000000000B',
        email: 'b@collide.example',
        name: null,
        image: null,
        createdAt: AT,
      }) as never,
    ])

    await provisionHousehold(client, {
      userId: 'UCOLL0000000000000000000A',
      householdName: 'Existing',
      ids: {
        householdId: 'HCOLLIDE000000000000000AA',
        membershipId: 'MCOLLIDE000000000000000AA',
        auditId: 'ACOLLIDE000000000000000AA',
      },
      at: AT,
    })

    // A second, different user provisioning onto the SAME (already-taken)
    // household id: the households.id PRIMARY KEY collision must fail the
    // membership and audit inserts too, not just the household insert.
    await expect(
      provisionHousehold(client, {
        userId: 'UCOLL0000000000000000000B',
        householdName: 'Colliding',
        ids: {
          householdId: 'HCOLLIDE000000000000000AA',
          membershipId: 'MCOLLIDE000000000000000BB',
          auditId: 'ACOLLIDE000000000000000BB',
        },
        at: AT + 1,
      }),
    ).rejects.toThrow()

    expect(await client.db.select().from(memberships)).toHaveLength(1)
    expect(await client.db.select().from(auditLog)).toHaveLength(1)
  })
})

/**
 * T030 — the before-create fail-closed guard (research.md R4): while an
 * unclaimed migrated household exists and `OWNER_EMAIL` is unset, sign-in is
 * refused before anything is persisted.
 */
describe('assertSignInAllowed (US2 fail-closed guard)', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('refuses with nothing persisted when OWNER_EMAIL is unset while a migrated household is unclaimed', async () => {
    database = await createTestDatabase()
    const client = database.client

    await seedUnclaimedMigratedHousehold(client, 'HGUARD00000000000000000AA')

    await expect(assertSignInAllowed(client, null)).rejects.toThrow(OwnerUnconfiguredError)

    // Nothing beyond the pre-existing placeholder setup exists — the guard
    // itself writes nothing.
    expect(await client.db.select().from(users)).toHaveLength(1)
    expect(await client.db.select().from(households)).toHaveLength(1)
  })

  it('is inert when OWNER_EMAIL is configured, even with an unclaimed migrated household', async () => {
    database = await createTestDatabase()
    const client = database.client
    await seedUnclaimedMigratedHousehold(client, 'HGUARD00000000000000000BB')
    await expect(assertSignInAllowed(client, 'owner@real.example')).resolves.toBeUndefined()
  })

  it('is inert on a deployment with no unclaimed migrated household, OWNER_EMAIL unset or not', async () => {
    database = await createTestDatabase()
    const client = database.client
    await expect(assertSignInAllowed(client, null)).resolves.toBeUndefined()
  })
})

/**
 * T030 — a non-designated user still provisions normally and gains no
 * access to the migrated household, even while one is unclaimed.
 */
describe('onFirstSignIn (US2 non-designated user)', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('provisions a fresh household for a user who is not the designated owner', async () => {
    database = await createTestDatabase()
    const client = database.client
    const migratedHouseholdId = 'HGUARD00000000000000000CC'
    await seedUnclaimedMigratedHousehold(client, migratedHouseholdId)

    await atomically(client, [
      client.db.insert(users).values({
        id: 'UNOTOWNER000000000000000A',
        email: 'someone-else@household.example',
        name: null,
        image: null,
        createdAt: AT,
      }) as never,
    ])

    const outcome = await onFirstSignIn(client, {
      userId: 'UNOTOWNER000000000000000A',
      email: 'someone-else@household.example',
      emailVerified: true,
      ownerEmail: 'the-real-owner@household.example',
      ids: {
        householdId: 'HNOTOWNER00000000000000AA',
        membershipId: 'MNOTOWNER00000000000000AA',
        auditId: 'ANOTOWNER00000000000000AA',
      },
      at: AT,
    })

    expect(outcome).toBe('provisioned')

    const membershipRows = await client.db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, 'UNOTOWNER000000000000000A'))
    expect(membershipRows).toHaveLength(1)
    expect(membershipRows[0]?.householdId).toBe('HNOTOWNER00000000000000AA')
    expect(membershipRows[0]?.householdId).not.toBe(migratedHouseholdId)

    // The migrated household's owner membership is untouched.
    const migratedOwner = await client.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.householdId, migratedHouseholdId), eq(memberships.role, 'owner')))
    expect(migratedOwner).toHaveLength(1)
    expect(migratedOwner[0]?.userId).not.toBe('UNOTOWNER000000000000000A')
  })
})

async function seedUnclaimedMigratedHousehold(
  client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
  householdId: string,
): Promise<void> {
  const placeholderId = `PLACEHOLDER-${householdId}`
  await atomically(client, [
    client.db.insert(households).values({
      id: householdId,
      name: 'Migrated household',
      baseCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      createdAt: AT,
    }) as never,
    client.db.insert(users).values({
      id: placeholderId,
      email: 'owner@household.local',
      name: null,
      image: null,
      createdAt: AT,
    }) as never,
    client.db.insert(memberships).values({
      id: `MPLACEHOLDER-${householdId}`,
      householdId,
      userId: placeholderId,
      role: 'owner',
      joinedAt: AT,
    }) as never,
  ])
}
