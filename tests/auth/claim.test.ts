import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { accounts, auditLog, authAccounts, households, memberships, users } from '../../db/schema/index'
import { onFirstSignIn } from '../../lib/auth/on-first-sign-in'
import { atomically } from '../../lib/data/atomically'
import { claimMigratedHousehold, provisionHousehold } from '../../lib/data/index'
import { derivedId } from '../../lib/import/ids'
import { DEFAULT_OWNER_EMAIL } from '../../lib/import/importer'
import { ClaimAlreadyMadeError } from '../../lib/errors'
import { createTestDatabase, type TestDatabase } from '../helpers/db'

/**
 * T030 — the owner claim (research.md R4): hook-path claim, one-time,
 * placeholder retirement (spec FR-011/FR-012), and the recovery-script path
 * (guarded precondition, successful park — data-model.md's parked-shell
 * note).
 */

const AT = 1_787_000_000_000
const MIGRATED_HOUSEHOLD = 'HMIGRATED000000000000000A'
const PLACEHOLDER_ID = derivedId(MIGRATED_HOUSEHOLD, 'users', DEFAULT_OWNER_EMAIL)

describe('claimMigratedHousehold', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('hook-path: repoints the owner membership, audits it, and leaves imported rows unchanged', async () => {
    database = await createTestDatabase()
    const client = database.client
    await seedMigratedHousehold(client)
    await seedImportedAccount(client)

    await atomically(client, [
      client.db.insert(users).values({
        id: 'UREALOWNER00000000000000A',
        email: 'real-owner@household.example',
        name: 'Real Owner',
        image: null,
        createdAt: AT,
      }) as never,
    ])

    const outcome = await onFirstSignIn(client, {
      userId: 'UREALOWNER00000000000000A',
      email: 'real-owner@household.example',
      emailVerified: true,
      ownerEmail: 'real-owner@household.example',
      ids: {
        householdId: 'HUNUSED0000000000000000AA',
        membershipId: 'MUNUSED0000000000000000AA',
        auditId: 'ACLAIM00000000000000000AA',
      },
      at: AT,
    })
    expect(outcome).toBe('claimed')

    const ownerRow = await client.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.householdId, MIGRATED_HOUSEHOLD), eq(memberships.role, 'owner')))
    expect(ownerRow).toHaveLength(1)
    expect(ownerRow[0]?.userId).toBe('UREALOWNER00000000000000A')

    const claimAudit = await client.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.householdId, MIGRATED_HOUSEHOLD), eq(auditLog.action, 'update')))
    expect(claimAudit).toHaveLength(1)
    expect(claimAudit[0]).toMatchObject({ entity: 'memberships', actorId: 'UREALOWNER00000000000000A' })
    expect(JSON.parse(claimAudit[0]!.beforeJson!)).toEqual({ userId: PLACEHOLDER_ID })
    expect(JSON.parse(claimAudit[0]!.afterJson!)).toEqual({ userId: 'UREALOWNER00000000000000A' })

    // FR-012: the claim changes ownership and access only — imported rows
    // are untouched.
    const importedRows = await client.db.select().from(accounts).where(eq(accounts.householdId, MIGRATED_HOUSEHOLD))
    expect(importedRows).toEqual([importedAccountRow()])

    // No new household was provisioned for the real owner.
    expect(await client.db.select().from(households)).toHaveLength(1)
  })

  it('is one-time: a second claim attempt is refused, writing nothing', async () => {
    database = await createTestDatabase()
    const client = database.client
    await seedMigratedHousehold(client)
    await seedUser(client, 'UFIRST0000000000000000AA', 'first@household.example')
    await seedUser(client, 'USECOND000000000000000AA', 'second@household.example')

    await claimMigratedHousehold(client, {
      migratedHouseholdId: MIGRATED_HOUSEHOLD,
      newOwnerUserId: 'UFIRST0000000000000000AA',
      ids: { auditId: 'AFIRST0000000000000000AA' },
      at: AT,
    })

    await expect(
      claimMigratedHousehold(client, {
        migratedHouseholdId: MIGRATED_HOUSEHOLD,
        newOwnerUserId: 'USECOND000000000000000AA',
        ids: { auditId: 'ASECOND000000000000000AA' },
        at: AT + 1,
      }),
    ).rejects.toThrow(ClaimAlreadyMadeError)

    const auditRows = await client.db.select().from(auditLog).where(eq(auditLog.householdId, MIGRATED_HOUSEHOLD))
    expect(auditRows).toHaveLength(1)
    const owner = await client.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.householdId, MIGRATED_HOUSEHOLD), eq(memberships.role, 'owner')))
    expect(owner[0]?.userId).toBe('UFIRST0000000000000000AA')
  })

  it('the placeholder retains no auth_accounts row and so cannot authenticate (FR-011)', async () => {
    database = await createTestDatabase()
    const client = database.client
    await seedMigratedHousehold(client)
    await seedUser(client, 'UREALOWNER00000000000000B', 'real-owner-2@household.example')

    await claimMigratedHousehold(client, {
      migratedHouseholdId: MIGRATED_HOUSEHOLD,
      newOwnerUserId: 'UREALOWNER00000000000000B',
      ids: { auditId: 'ACLAIM00000000000000000BB' },
      at: AT,
    })

    // The placeholder user row itself remains (imported rows reference it as
    // historical fact) but it never had — and still has no — an OAuth
    // account link, which is what makes it structurally unauthenticatable.
    const placeholderStillExists = await client.db.select().from(users).where(eq(users.id, PLACEHOLDER_ID))
    expect(placeholderStillExists).toHaveLength(1)

    const placeholderAccounts = await client.db
      .select()
      .from(authAccounts)
      .where(eq(authAccounts.userId, PLACEHOLDER_ID))
    expect(placeholderAccounts).toHaveLength(0)
  })

  describe('recovery path (recoverEmptyShell)', () => {
    it('refuses to park a shell that holds a domain row beyond its membership', async () => {
      database = await createTestDatabase()
      const client = database.client
      await seedMigratedHousehold(client)
      await seedUser(client, 'UMISDESIGNATED000000000A', 'mis-designated-a@household.example')

      await provisionHousehold(client, {
        userId: 'UMISDESIGNATED000000000A',
        householdName: 'Mis-provisioned',
        ids: {
          householdId: 'HSHELL00000000000000000AA',
          membershipId: 'MSHELL00000000000000000AA',
          auditId: 'ASHELL00000000000000000AA',
        },
        at: AT,
      })
      // The claimant already created a real card in their auto-provisioned
      // shell before the recovery script runs.
      await atomically(client, [
        client.db.insert(accounts).values({
          id: 'ACCTSHELL000000000000000A',
          householdId: 'HSHELL00000000000000000AA',
          name: 'Shell account',
          kind: 'asset',
          assetClass: 'EGP',
          isInvestment: 0,
          balanceMode: 'stated',
          quantityMinor: 100,
          openingQuantityMinor: null,
          openingDate: null,
          asOf: null,
          sortOrder: 1,
          archivedAt: null,
          createdAt: AT,
        }) as never,
      ])

      await expect(
        claimMigratedHousehold(client, {
          migratedHouseholdId: MIGRATED_HOUSEHOLD,
          newOwnerUserId: 'UMISDESIGNATED000000000A',
          recoverEmptyShell: true,
          ids: { auditId: 'ARECOVER00000000000000AA', shellAuditId: 'ARECOVER00000000000000BB' },
          at: AT + 10,
        }),
      ).rejects.toThrow(/not an empty shell/)

      // Refused: the migrated household's owner membership is still the
      // placeholder's — nothing was written by the failed attempt.
      const owner = await client.db
        .select()
        .from(memberships)
        .where(and(eq(memberships.householdId, MIGRATED_HOUSEHOLD), eq(memberships.role, 'owner')))
      expect(owner[0]?.userId).toBe(PLACEHOLDER_ID)
    })

    it('parks a genuinely empty shell: both memberships repointed, both audits anchored, nothing deleted', async () => {
      database = await createTestDatabase()
      const client = database.client
      await seedMigratedHousehold(client)
      await seedUser(client, 'UMISDESIGNATED000000000B', 'mis-designated-b@household.example')

      await provisionHousehold(client, {
        userId: 'UMISDESIGNATED000000000B',
        householdName: 'Mis-provisioned',
        ids: {
          householdId: 'HSHELL00000000000000000BB',
          membershipId: 'MSHELL00000000000000000BB',
          auditId: 'ASHELL00000000000000000BB',
        },
        at: AT,
      })

      await claimMigratedHousehold(client, {
        migratedHouseholdId: MIGRATED_HOUSEHOLD,
        newOwnerUserId: 'UMISDESIGNATED000000000B',
        recoverEmptyShell: true,
        ids: { auditId: 'ARECOVER00000000000000CC', shellAuditId: 'ARECOVER00000000000000DD' },
        at: AT + 10,
      })

      // The claimant now holds exactly one membership: the migrated
      // household, as owner.
      const claimantMemberships = await client.db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, 'UMISDESIGNATED000000000B'))
      expect(claimantMemberships).toHaveLength(1)
      expect(claimantMemberships[0]?.householdId).toBe(MIGRATED_HOUSEHOLD)
      expect(claimantMemberships[0]?.role).toBe('owner')

      // The shell survives (not deleted) with its membership parked onto
      // the placeholder.
      const shellRows = await client.db.select().from(households).where(eq(households.id, 'HSHELL00000000000000000BB'))
      expect(shellRows).toHaveLength(1)
      const shellMembership = await client.db
        .select()
        .from(memberships)
        .where(eq(memberships.householdId, 'HSHELL00000000000000000BB'))
      expect(shellMembership).toHaveLength(1)
      expect(shellMembership[0]?.userId).toBe(PLACEHOLDER_ID)

      // Both audit entries exist, each anchored to its own household.
      const migratedAudit = await client.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.householdId, MIGRATED_HOUSEHOLD), eq(auditLog.action, 'update')))
      expect(migratedAudit).toHaveLength(1)
      const shellAudit = await client.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.householdId, 'HSHELL00000000000000000BB'), eq(auditLog.action, 'update')))
      expect(shellAudit).toHaveLength(1)
      expect(JSON.parse(shellAudit[0]!.afterJson!)).toEqual({ userId: PLACEHOLDER_ID })
    })
  })
})

async function seedUser(
  client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
  id: string,
  email: string,
): Promise<void> {
  await atomically(client, [
    client.db.insert(users).values({ id, email, name: null, image: null, createdAt: AT }) as never,
  ])
}

async function seedMigratedHousehold(
  client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
): Promise<void> {
  await atomically(client, [
    client.db.insert(households).values({
      id: MIGRATED_HOUSEHOLD,
      name: 'Migrated household',
      baseCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      createdAt: AT,
    }) as never,
    client.db.insert(users).values({
      id: PLACEHOLDER_ID,
      email: DEFAULT_OWNER_EMAIL,
      name: null,
      image: null,
      createdAt: AT,
    }) as never,
    client.db.insert(memberships).values({
      id: `M-${MIGRATED_HOUSEHOLD}`,
      householdId: MIGRATED_HOUSEHOLD,
      userId: PLACEHOLDER_ID,
      role: 'owner',
      joinedAt: AT,
    }) as never,
  ])
}

function importedAccountRow() {
  return {
    id: 'ACCTIMPORTED0000000000000',
    householdId: MIGRATED_HOUSEHOLD,
    name: 'ADIB C.C',
    kind: 'liability',
    assetClass: 'EGP',
    isInvestment: 0,
    balanceMode: 'stated',
    quantityMinor: 60000,
    openingQuantityMinor: null,
    openingDate: null,
    asOf: null,
    sortOrder: 13,
    archivedAt: null,
    createdAt: AT,
  }
}

async function seedImportedAccount(
  client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
): Promise<void> {
  await atomically(client, [client.db.insert(accounts).values(importedAccountRow()) as never])
}
