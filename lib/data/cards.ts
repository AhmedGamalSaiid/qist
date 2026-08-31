import { and, eq, ne } from 'drizzle-orm'
import type { AppClient, Statement } from '../../db/client'
import { cards } from '../../db/schema/index'
import { CardNotFoundError, CardValidationError } from '../errors'
import { atomically } from './atomically'
import { assertWriter } from './authz'
import { recordAudit } from './audit'
import type { HouseholdContext } from './context'
import { cleanName, validateCardInput, type CardInput, type RawCardInput } from './validate-cards'

export type { CardInput }

const DUPLICATE_NAME_REASON = [{ field: 'name', message: 'must be unique within the household (case-insensitive)' }]

/**
 * The uniqueness pre-read is UX (the full `422` reasons list); the
 * `cards_household_name_unique` index is the integrity guarantee for a
 * genuine race — two concurrent creates whose pre-reads both saw no
 * conflict. Both drivers are SQLite underneath, so a violation of that
 * specific index surfaces the same recognisable message on either
 * (research.md R7); anything else rethrows unchanged.
 */
async function runCardWrite(client: AppClient, statements: Statement[]): Promise<void> {
  try {
    await atomically(client, statements)
  } catch (error) {
    if (error instanceof Error && error.message.includes('cards_household_name_unique')) {
      throw new CardValidationError(DUPLICATE_NAME_REASON)
    }
    throw error
  }
}

/**
 * Card writes (T033, research.md R7, contracts/data-layer.md).
 *
 * `assertWriter` → validate → the one `atomically([write, audit])` batch,
 * the foundation's established pattern (`recordCorrection`,
 * `setBalanceMode`). Optional fields absent on create are stored NULL,
 * never invented (spec FR-014); an explicit `null` on update clears a
 * previously-set field (spec FR-015).
 */

export interface CreateCardInput extends RawCardInput {
  readonly id: string
  readonly auditId: string
  readonly at: number
}

export async function createCard(
  client: AppClient,
  ctx: HouseholdContext,
  input: CreateCardInput,
): Promise<void> {
  assertWriter(ctx)

  const rows = await client.db
    .select({ name: cards.name, sortOrder: cards.sortOrder })
    .from(cards)
    .where(eq(cards.householdId, ctx.householdId))

  const reasons = validateCardInput(input, {
    mode: 'create',
    existingNamesLowercase: new Set(rows.map((r) => r.name.toLowerCase())),
  })
  if (reasons.length > 0) throw new CardValidationError(reasons)

  const sortOrder = rows.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1
  // Validated above: each of these is `null` or an in-range integer by the
  // time we reach here — narrowing what `validateCardInput` already checked.
  const after = {
    name: cleanName(input.name),
    limitMinor: (input.limitMinor ?? null) as number | null,
    statementDay: (input.statementDay ?? null) as number | null,
    dueDay: (input.dueDay ?? null) as number | null,
  }

  const statements: Statement[] = [
    client.db.insert(cards).values({
      id: input.id,
      householdId: ctx.householdId,
      name: after.name,
      limitMinor: after.limitMinor,
      statementDay: after.statementDay,
      dueDay: after.dueDay,
      sortOrder,
      createdAt: input.at,
    }) as unknown as Statement,
    recordAudit(client, ctx, {
      id: input.auditId,
      action: 'create',
      entity: 'cards',
      entityId: input.id,
      before: null,
      after,
      at: input.at,
    }),
  ]

  await runCardWrite(client, statements)
}

export interface UpdateCardInput extends RawCardInput {
  readonly cardId: string
  readonly auditId: string
  readonly at: number
}

export async function updateCard(
  client: AppClient,
  ctx: HouseholdContext,
  input: UpdateCardInput,
): Promise<void> {
  assertWriter(ctx)

  const rows = await client.db
    .select()
    .from(cards)
    .where(and(eq(cards.householdId, ctx.householdId), eq(cards.id, input.cardId)))
    .limit(1)
  const before = rows[0]
  if (before === undefined) throw new CardNotFoundError(input.cardId)

  let existingNamesLowercase = new Set<string>()
  if ('name' in input) {
    const others = await client.db
      .select({ name: cards.name })
      .from(cards)
      .where(and(eq(cards.householdId, ctx.householdId), ne(cards.id, input.cardId)))
    existingNamesLowercase = new Set(others.map((r) => r.name.toLowerCase()))
  }

  const reasons = validateCardInput(input, { mode: 'update', existingNamesLowercase })
  if (reasons.length > 0) throw new CardValidationError(reasons)

  const changes: {
    name?: string
    limitMinor?: number | null
    statementDay?: number | null
    dueDay?: number | null
  } = {}
  // Validated above: each present field is `null` or an in-range integer.
  if ('name' in input) changes.name = cleanName(input.name)
  if ('limitMinor' in input) changes.limitMinor = (input.limitMinor ?? null) as number | null
  if ('statementDay' in input) changes.statementDay = (input.statementDay ?? null) as number | null
  if ('dueDay' in input) changes.dueDay = (input.dueDay ?? null) as number | null

  const beforeState = {
    name: before.name,
    limitMinor: before.limitMinor,
    statementDay: before.statementDay,
    dueDay: before.dueDay,
  }
  const afterState = { ...beforeState, ...changes }

  const statements: Statement[] = [
    client.db
      .update(cards)
      .set(changes)
      .where(and(eq(cards.householdId, ctx.householdId), eq(cards.id, input.cardId))) as unknown as Statement,
    recordAudit(client, ctx, {
      id: input.auditId,
      action: 'update',
      entity: 'cards',
      entityId: input.cardId,
      before: beforeState,
      after: afterState,
      at: input.at,
    }),
  ]

  await runCardWrite(client, statements)
}
