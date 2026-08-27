import { and, eq } from 'drizzle-orm'
import type { AppClient, Statement } from '../../db/client'
import { transactions } from '../../db/schema/index'
import { CorrectionCycleError } from '../errors'
import type { IsoDate, MinorUnits } from '../money/types'
import { atomically } from './atomically'
import { recordAudit } from './audit'
import type { HouseholdContext } from './context'

/**
 * Corrections (T075, T076, FR-013, FR-015).
 *
 * A correction is a **new row** linked to the row it corrects by
 * `reverses_id`. There is no in-place edit and no delete of history anywhere
 * in this file, because the original entry is part of the record: a household
 * that cannot see what it previously believed cannot audit itself.
 *
 * Three rules, each enforced where it is actually enforceable:
 *
 * | Rule                                | Enforced by                          |
 * |-------------------------------------|--------------------------------------|
 * | A row may not reverse itself        | table CHECK — single-row             |
 * | A row may not be reversed twice     | partial UNIQUE(household_id, reverses_id) |
 * | No cycles of length > 1             | the walk below, inside the write     |
 *
 * A SQLite `CHECK` may only reference columns of the row being written; it
 * cannot follow `reverses_id` to another row. An earlier draft of the data
 * model asserted "no cycles" as a CHECK, which would have enforced nothing at
 * all while reading as though it did.
 */

export interface CorrectionInput {
  readonly id: string
  readonly reversesId: string
  readonly occurredOn: IsoDate
  readonly kind: 'income' | 'expense' | 'transfer'
  readonly amountMinor: MinorUnits
  readonly currency: 'EGP' | 'USD'
  readonly rateId: string | null
  readonly category?: string | null
  readonly note?: string | null
  readonly accountId?: string | null
  readonly at: number
  readonly auditId: string
}

export async function recordCorrection(
  client: AppClient,
  ctx: HouseholdContext,
  input: CorrectionInput,
): Promise<void> {
  const original = await loadRow(client, ctx, input.reversesId)
  if (original === null) {
    throw new TypeError(
      `Cannot correct ${input.reversesId}: no such transaction in this household.`,
    )
  }

  await assertNoCycle(client, ctx, input.id, input.reversesId)

  // Every statement exists before the atom opens (R9a). The cycle walk above
  // is a read, so it happens first and its conclusion is encoded in what is
  // written — not re-checked inside a transaction callback, which D1 has no
  // way to give us.
  const statements: Statement[] = [
    client.db.insert(transactions).values({
      id: input.id,
      householdId: ctx.householdId,
      occurredOn: input.occurredOn,
      kind: input.kind,
      category: input.category ?? null,
      accountId: input.accountId ?? null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      rateId: input.rateId,
      note: input.note ?? null,
      reversesId: input.reversesId,
      createdBy: ctx.userId,
      createdAt: input.at,
    }) as unknown as Statement,
    recordAudit(client, ctx, {
      id: input.auditId,
      action: 'create',
      entity: 'transactions',
      entityId: input.id,
      before: null,
      after: { reversesId: input.reversesId, amountMinor: input.amountMinor },
      at: input.at,
    }),
  ]

  await atomically(client, statements)
}

/**
 * Walk `reverses_id` from the proposed row and reject if it revisits a row
 * already seen.
 *
 * The walk is bounded by the chain length, which is small by construction: a
 * row can be reversed only once, so a chain is linear. Correction *chains* are
 * allowed — a correction may itself be corrected — and what is forbidden is a
 * *cycle*, which would make the net effect of the ledger undefined.
 */
export async function assertNoCycle(
  client: AppClient,
  ctx: HouseholdContext,
  proposedId: string,
  reversesId: string,
): Promise<void> {
  const seen = new Set<string>([proposedId])
  const chain: string[] = [proposedId]
  let cursor: string | null = reversesId

  while (cursor !== null) {
    chain.push(cursor)
    if (seen.has(cursor)) {
      throw new CorrectionCycleError(chain)
    }
    seen.add(cursor)
    const row: { reversesId: string | null } | null = await loadRow(client, ctx, cursor)
    if (row === null) break
    cursor = row.reversesId
  }
}

async function loadRow(
  client: AppClient,
  ctx: HouseholdContext,
  id: string,
): Promise<{ id: string; reversesId: string | null; amountMinor: number } | null> {
  const rows = await client.db
    .select({
      id: transactions.id,
      reversesId: transactions.reversesId,
      amountMinor: transactions.amountMinor,
    })
    .from(transactions)
    .where(and(eq(transactions.householdId, ctx.householdId), eq(transactions.id, id)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The net effect of an entry and its correction (FR-016).
 *
 * A reversed entry and its reversal both stay in the ledger; what changes is
 * what the totals count. The rule is that a row which has been reversed no
 * longer contributes, and the correcting row does.
 */
export function netEntries<T extends { id: string; reversesId: string | null }>(
  rows: readonly T[],
): T[] {
  const reversed = new Set(rows.map((r) => r.reversesId).filter((id): id is string => id !== null))
  return rows.filter((row) => !reversed.has(row.id))
}
