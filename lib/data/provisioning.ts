import { and, eq } from 'drizzle-orm'
import type { AppClient, Statement } from '../../db/client'
import {
  accounts,
  auditLog,
  cardPayments,
  cards,
  households,
  incomeSettings,
  installments,
  liabilities,
  memberships,
  propertyHoldings,
  rates,
  snapshots,
  transactions,
  users,
} from '../../db/schema/index'
import { ClaimAlreadyMadeError, ProvisioningConflictError } from '../errors'
import { DEFAULT_OWNER_EMAIL } from '../import/importer'
import { derivedId } from '../import/ids'
import { atomically } from './atomically'

/**
 * First-sign-in household provisioning (T019, spec FR-005).
 *
 * `households` insert + owner `memberships` insert + `audit_log` (`create`,
 * entity `household`) in one atom. Idempotent per user: a user who already
 * holds any membership is refused rather than handed a second household —
 * the read happens before the atom opens, as every write in this layer does
 * (R9a).
 */
export interface ProvisionHouseholdInput {
  readonly userId: string
  readonly householdName: string
  readonly ids: {
    readonly householdId: string
    readonly membershipId: string
    readonly auditId: string
  }
  readonly at: number
}

export async function provisionHousehold(
  client: AppClient,
  input: ProvisionHouseholdInput,
): Promise<void> {
  const existing = await client.db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.userId, input.userId))
    .limit(1)

  if (existing.length > 0) {
    throw new ProvisioningConflictError(input.userId)
  }

  const { householdId, membershipId, auditId } = input.ids

  const statements: Statement[] = [
    client.db.insert(households).values({
      id: householdId,
      name: input.householdName,
      baseCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      createdAt: input.at,
    }) as unknown as Statement,
    client.db.insert(memberships).values({
      id: membershipId,
      householdId,
      userId: input.userId,
      role: 'owner',
      joinedAt: input.at,
    }) as unknown as Statement,
    // No `ctx` exists yet — this precedes any household context — so the
    // audit statement is built directly rather than through `recordAudit`'s
    // `HouseholdContext`-shaped helper.
    client.db.insert(auditLog).values({
      id: auditId,
      householdId,
      actorId: input.userId,
      actorKind: 'user',
      action: 'create',
      entity: 'household',
      entityId: householdId,
      beforeJson: null,
      afterJson: JSON.stringify({ name: input.householdName }),
      at: input.at,
    }) as unknown as Statement,
  ]

  await atomically(client, statements)
}

/**
 * The importer's synthetic placeholder user id for a given migrated
 * household — deterministic, exactly as the importer computed it
 * (`lib/import/importer.ts`: `derivedId(householdId, 'users', ownerEmail)`
 * with the default `owner@household.local`). Valid while the dump is
 * frozen, same caveat as every other use of `lib/import/ids.ts` past import
 * time (research.md R6).
 */
export function placeholderUserIdFor(migratedHouseholdId: string): string {
  return derivedId(migratedHouseholdId, 'users', DEFAULT_OWNER_EMAIL)
}

/**
 * The migrated household's id, if it still has an owner membership held by
 * the importer's placeholder user (i.e. unclaimed) — or `null` on a
 * deployment with no migrated household, or one that has already been
 * claimed. Used by the fail-closed guard and the claim branch of
 * `onFirstSignIn` (research.md R4); not part of the exported surface.
 */
export async function findUnclaimedMigratedHouseholdId(client: AppClient): Promise<string | null> {
  const rows = await client.db
    .select({ householdId: memberships.householdId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.role, 'owner'), eq(users.email, DEFAULT_OWNER_EMAIL)))
    .limit(1)
  return rows[0]?.householdId ?? null
}

const DOMAIN_TABLES = [
  accounts,
  propertyHoldings,
  liabilities,
  installments,
  transactions,
  cards,
  cardPayments,
  rates,
  snapshots,
] as const

/**
 * Whether a household holds any domain row at all — the precondition the
 * recovery path's "empty shell" park requires (data-model.md, parked-shell
 * note). The shell's own membership row and its own provisioning
 * `audit_log` entry are identity/meta rows, not domain data, and are not
 * checked here.
 */
async function isEmptyShellHousehold(client: AppClient, householdId: string): Promise<boolean> {
  for (const table of DOMAIN_TABLES) {
    const rows = await client.db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.householdId, householdId))
      .limit(1)
    if (rows.length > 0) return false
  }
  const income = await client.db
    .select({ householdId: incomeSettings.householdId })
    .from(incomeSettings)
    .where(eq(incomeSettings.householdId, householdId))
    .limit(1)
  return income.length === 0
}

export interface ClaimMigratedHouseholdInput {
  readonly migratedHouseholdId: string
  readonly newOwnerUserId: string
  readonly recoverEmptyShell?: boolean
  readonly ids: {
    readonly auditId: string
    readonly shellAuditId?: string
  }
  readonly at: number
}

/**
 * The operator-designated owner's claim of the migrated household (T027,
 * research.md R4).
 *
 * One atomic batch: repoints the migrated household's owner membership from
 * the importer's placeholder user to `newOwnerUserId`, audited
 * (`update`, `memberships`, before/after). Guarded — the current holder must
 * still be the placeholder, which is what makes the claim one-time: a second
 * attempt finds someone else already holding it and refuses, writing
 * nothing.
 *
 * `recoverEmptyShell: true` additionally parks the claimant's own
 * auto-provisioned household in the same atom, provided it holds no domain
 * row — see `isEmptyShellHousehold`. Nothing is ever deleted: the shell's
 * membership is repointed onto the placeholder user instead, and the park is
 * itself audited on the shell household.
 */
export async function claimMigratedHousehold(
  client: AppClient,
  input: ClaimMigratedHouseholdInput,
): Promise<void> {
  const placeholderId = placeholderUserIdFor(input.migratedHouseholdId)

  const ownerRows = await client.db
    .select({ id: memberships.id, userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.householdId, input.migratedHouseholdId), eq(memberships.role, 'owner')))
    .limit(1)
  const ownerMembership = ownerRows[0]

  if (ownerMembership === undefined || ownerMembership.userId !== placeholderId) {
    throw new ClaimAlreadyMadeError(input.migratedHouseholdId)
  }

  const statements: Statement[] = [
    client.db
      .update(memberships)
      .set({ userId: input.newOwnerUserId })
      .where(
        and(
          eq(memberships.id, ownerMembership.id),
          eq(memberships.householdId, input.migratedHouseholdId),
          eq(memberships.userId, placeholderId),
        ),
      ) as unknown as Statement,
    client.db.insert(auditLog).values({
      id: input.ids.auditId,
      householdId: input.migratedHouseholdId,
      actorId: input.newOwnerUserId,
      actorKind: 'user',
      action: 'update',
      entity: 'memberships',
      entityId: ownerMembership.id,
      beforeJson: JSON.stringify({ userId: placeholderId }),
      afterJson: JSON.stringify({ userId: input.newOwnerUserId }),
      at: input.at,
    }) as unknown as Statement,
  ]

  if (input.recoverEmptyShell === true) {
    const shellRows = await client.db
      .select({ id: memberships.id, householdId: memberships.householdId })
      .from(memberships)
      .where(eq(memberships.userId, input.newOwnerUserId))

    if (shellRows.length !== 1) {
      throw new TypeError(
        `Recovery precondition failed: user ${input.newOwnerUserId} holds ${shellRows.length} ` +
          `memberships, expected exactly one (the auto-provisioned shell to park).`,
      )
    }
    const shell = shellRows[0]!

    if (!(await isEmptyShellHousehold(client, shell.householdId))) {
      throw new TypeError(
        `Recovery precondition failed: household ${shell.householdId} holds domain rows beyond ` +
          `its own membership, so it is not an empty shell and will not be parked.`,
      )
    }

    const shellAuditId = input.ids.shellAuditId
    if (shellAuditId === undefined) {
      throw new TypeError('recoverEmptyShell requires ids.shellAuditId.')
    }

    statements.push(
      client.db
        .update(memberships)
        .set({ userId: placeholderId })
        .where(and(eq(memberships.id, shell.id), eq(memberships.userId, input.newOwnerUserId))) as unknown as Statement,
      client.db.insert(auditLog).values({
        id: shellAuditId,
        householdId: shell.householdId,
        actorId: input.newOwnerUserId,
        actorKind: 'user',
        action: 'update',
        entity: 'memberships',
        entityId: shell.id,
        beforeJson: JSON.stringify({ userId: input.newOwnerUserId }),
        afterJson: JSON.stringify({ userId: placeholderId }),
        at: input.at,
      }) as unknown as Statement,
    )
  }

  await atomically(client, statements)
}
