import { and, eq } from 'drizzle-orm'
import type { AppClient } from '../../db/client'
import { households, memberships } from '../../db/schema/index'

/**
 * Household context (R5, FR-021).
 *
 * **Scoping derives from the authenticated identity and is never taken from
 * caller-supplied input.** A caller may say *which* of their households they
 * mean, but that name is checked against their memberships before it becomes a
 * context — passing a household id they are not a member of resolves to
 * nothing rather than to that household's data.
 *
 * Once constructed, a context is the only thing a repository is built from,
 * and no repository method accepts a household id. A query written without
 * scoping is not expressible against the exported surface.
 */

export interface Identity {
  readonly userId: string
}

export interface HouseholdContext {
  readonly householdId: string
  readonly userId: string
  readonly role: string
  /** The canonical zone for every date-dependent figure (FR-034). */
  readonly timezone: string
  readonly baseCurrency: string
}

export async function householdsFor(
  client: AppClient,
  identity: Identity,
): Promise<HouseholdContext[]> {
  const rows = await client.db
    .select({
      householdId: memberships.householdId,
      role: memberships.role,
      timezone: households.timezone,
      baseCurrency: households.baseCurrency,
    })
    .from(memberships)
    .innerJoin(households, eq(households.id, memberships.householdId))
    .where(eq(memberships.userId, identity.userId))

  return rows.map((row) => ({
    householdId: row.householdId,
    userId: identity.userId,
    role: row.role,
    timezone: row.timezone,
    baseCurrency: row.baseCurrency,
  }))
}

/**
 * Resolve a context for a household this identity actually belongs to.
 *
 * Returns `null` rather than throwing when the identity is not a member, so a
 * caller that passes another household's id gets the same answer as one that
 * passes a household that does not exist: nothing.
 */
export async function householdContextFor(
  client: AppClient,
  identity: Identity,
  householdId: string,
): Promise<HouseholdContext | null> {
  const rows = await client.db
    .select({
      householdId: memberships.householdId,
      role: memberships.role,
      timezone: households.timezone,
      baseCurrency: households.baseCurrency,
    })
    .from(memberships)
    .innerJoin(households, eq(households.id, memberships.householdId))
    .where(and(eq(memberships.userId, identity.userId), eq(memberships.householdId, householdId)))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null
  return {
    householdId: row.householdId,
    userId: identity.userId,
    role: row.role,
    timezone: row.timezone,
    baseCurrency: row.baseCurrency,
  }
}

/**
 * A context for a CLI that has no authenticated user — the importer and the
 * reconciler.
 *
 * It resolves the household's *owner* and builds a real context around them,
 * so even a script runs against the same scoped surface as everything else.
 * There is no unscoped path for a script to take instead.
 */
export async function ownerContextFor(
  client: AppClient,
  householdId: string,
): Promise<HouseholdContext | null> {
  const rows = await client.db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      timezone: households.timezone,
      baseCurrency: households.baseCurrency,
    })
    .from(memberships)
    .innerJoin(households, eq(households.id, memberships.householdId))
    .where(and(eq(memberships.householdId, householdId), eq(memberships.role, 'owner')))
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null
  return {
    householdId,
    userId: row.userId,
    role: row.role,
    timezone: row.timezone,
    baseCurrency: row.baseCurrency,
  }
}

/** Every household in the database. For CLI entry points only. */
export async function listHouseholdIds(client: AppClient): Promise<string[]> {
  const rows = await client.db.select({ id: households.id }).from(households)
  return rows.map((r) => r.id)
}
