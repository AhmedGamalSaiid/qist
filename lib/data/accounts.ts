import { and, eq } from 'drizzle-orm'
import type { AppClient, Statement } from '../../db/client'
import { accounts, transactions } from '../../db/schema/index'
import type { IsoDate, MinorUnits } from '../money/types'
import { atomically } from './atomically'
import { recordAudit } from './audit'
import type { HouseholdContext } from './context'

/**
 * Balance modes (T078, FR-024 - FR-028).
 *
 * An account declares how its balance is established:
 *
 * - `stated` — the balance is the number recorded on the account. This is what
 *   the spreadsheet does, and every account imports this way at the sheet's
 *   exact value (FR-025).
 * - `derived` — the balance is an opening balance plus the net of entries
 *   since an opening date (FR-026).
 *
 * Switching is explicit and recorded (FR-027), and it changes no figure dated
 * before the switch: a derived balance is defined only from its opening date
 * forward, so history stays what it was.
 */

export type BalanceMode = 'stated' | 'derived'

export interface AccountBalance {
  readonly accountId: string
  readonly mode: BalanceMode
  readonly quantityMinor: MinorUnits
  /** Where the number came from — the report shows this wherever a balance
   * appears (FR-028, US2 acceptance scenario 7). */
  readonly basis: string
}

export interface SwitchToDerived {
  readonly accountId: string
  readonly openingQuantityMinor: MinorUnits
  readonly openingDate: IsoDate
  readonly at: number
  readonly auditId: string
}

export async function setBalanceMode(
  client: AppClient,
  ctx: HouseholdContext,
  input: SwitchToDerived,
): Promise<void> {
  const before = await loadAccount(client, ctx, input.accountId)
  if (before === null) {
    throw new TypeError(`No account ${input.accountId} in this household.`)
  }

  // FR-026: derived mode requires both an opening balance and its date. The
  // CHECK constraint makes the inconsistent row unrepresentable; refusing here
  // means the caller gets a message rather than a constraint violation.
  if (!Number.isInteger(input.openingQuantityMinor)) {
    throw new TypeError('An opening balance must be an integer minor-unit amount.')
  }

  const statements: Statement[] = [
    client.db
      .update(accounts)
      .set({
        balanceMode: 'derived',
        quantityMinor: null,
        openingQuantityMinor: input.openingQuantityMinor,
        openingDate: input.openingDate,
      })
      .where(
        and(eq(accounts.householdId, ctx.householdId), eq(accounts.id, input.accountId)),
      ) as unknown as Statement,
    recordAudit(client, ctx, {
      id: input.auditId,
      action: 'update',
      entity: 'accounts',
      entityId: input.accountId,
      before: { balanceMode: before.balanceMode, quantityMinor: before.quantityMinor },
      after: {
        balanceMode: 'derived',
        openingQuantityMinor: input.openingQuantityMinor,
        openingDate: input.openingDate,
      },
      at: input.at,
    }),
  ]

  await atomically(client, statements)
}

/**
 * An account's balance under whichever mode it declares.
 *
 * For a `derived` account this is the opening balance plus the net of entries
 * on or after the opening date. Entries before it are deliberately not counted
 * — that is what makes switching leave earlier figures untouched.
 */
export async function accountBalance(
  client: AppClient,
  ctx: HouseholdContext,
  accountId: string,
): Promise<AccountBalance | null> {
  const account = await loadAccount(client, ctx, accountId)
  if (account === null) return null

  if (account.balanceMode === 'stated') {
    return {
      accountId,
      mode: 'stated',
      quantityMinor: account.quantityMinor ?? 0,
      basis: 'stated on the account',
    }
  }

  const opening = account.openingQuantityMinor ?? 0
  const openingDate = account.openingDate ?? '0000-01-01'

  const rows = await client.db
    .select({
      kind: transactions.kind,
      amountMinor: transactions.amountMinor,
      occurredOn: transactions.occurredOn,
      id: transactions.id,
      reversesId: transactions.reversesId,
    })
    .from(transactions)
    .where(
      and(eq(transactions.householdId, ctx.householdId), eq(transactions.accountId, accountId)),
    )

  const reversed = new Set(rows.map((r) => r.reversesId).filter((id): id is string => id !== null))
  let net = 0
  for (const row of rows) {
    if (row.occurredOn < openingDate) continue
    if (reversed.has(row.id)) continue
    if (row.kind === 'income') net += row.amountMinor
    else if (row.kind === 'expense') net -= row.amountMinor
  }

  return {
    accountId,
    mode: 'derived',
    quantityMinor: opening + net,
    basis: `opening ${opening} on ${openingDate} plus entries since`,
  }
}

async function loadAccount(client: AppClient, ctx: HouseholdContext, id: string) {
  const rows = await client.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.householdId, ctx.householdId), eq(accounts.id, id)))
    .limit(1)
  return rows[0] ?? null
}
