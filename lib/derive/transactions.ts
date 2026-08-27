import { convert } from '../money/convert'
import type { EgpMinor, IsoDate } from '../money/types'
import { edate, startOfMonth } from './dates'
import type { RateRecord, TransactionLike } from './types'

/**
 * `Transactions!G` (T053).
 *
 * Uses the rate pinned by `transaction.rate_id` — the rate in force on
 * `occurred_on` — **not** the current rate (D6, FR-042).
 *
 * On today's data this returns the same number the sheet does, because the
 * sole imported rate is also the live rate captured in the dump. The
 * divergence D6 describes is behavioural and forward-looking: from the moment
 * a second USD rate is recorded, the sheet will restate this past transaction
 * at the new rate and this function will not. Both facts are true at once, and
 * the reconciliation report says which — a `DIVERGED` line whose `difference`
 * column reads `0` would be indistinguishable from a bug in the report.
 */
export function transactionEgp(
  transaction: Pick<TransactionLike, 'amountMinor' | 'currency' | 'rateId'>,
  rate: RateRecord | null,
): EgpMinor {
  if (transaction.currency === 'EGP') return transaction.amountMinor
  return convert(transaction.amountMinor, 'USD', rate)
}

export interface MonthlyRollupRow {
  readonly month: IsoDate
  readonly incomeMinor: EgpMinor
  readonly expenseMinor: EgpMinor
  readonly netMinor: EgpMinor
  /**
   * `netMinor / incomeMinor` — the one non-monetary output in this contract.
   *
   * A dimensionless ratio, carried as a `number`. It is **null** when income
   * is zero: the sheet returns `""` via `IFERROR`, and turning that into `0`
   * would claim a household saved nothing in a month it earned nothing. It is
   * never stored, never summed and never converted; it exists only for
   * display, which is why `lint:money` exempts it **by name** rather than by
   * loosening the rule to allow ratios generally.
   */
  readonly savingsRate: number | null
}

/**
 * `Transactions!J:N` (T054).
 *
 * The sheet's spine runs *forward* 24 months from 2026-08-01, so it is a
 * forecast grid rather than a history. This takes its month list as a
 * parameter instead of hard-coding that, because a spine baked into the code
 * would silently stop covering the data the moment time passed it.
 */
export function monthlyRollup(
  transactions: ReadonlyArray<TransactionLike & { egpMinor: EgpMinor }>,
  months: readonly IsoDate[],
): MonthlyRollupRow[] {
  return months.map((rawMonth) => {
    const month = startOfMonth(rawMonth)
    const nextMonth = edate(month, 1)

    let incomeMinor = 0
    let expenseMinor = 0
    for (const transaction of transactions) {
      if (transaction.occurredOn < month) continue
      if (transaction.occurredOn >= nextMonth) continue
      if (transaction.kind === 'income') incomeMinor += transaction.egpMinor
      else if (transaction.kind === 'expense') expenseMinor += transaction.egpMinor
    }

    const netMinor = incomeMinor - expenseMinor
    // The one exempt name in `lint:money`: a dimensionless ratio of two
    // integers, never stored, summed or converted. The exemption is keyed to
    // `savingsRate` itself, so the division has to stay on this line.
    const savingsRate = incomeMinor === 0 ? null : netMinor / incomeMinor

    return { month, incomeMinor, expenseMinor, netMinor, savingsRate }
  })
}

/** The 24-month forward spine the sheet uses, as `Transactions!J2:J25`. */
export function sheetMonthSpine(start: IsoDate, count = 24): IsoDate[] {
  const first = startOfMonth(start)
  return Array.from({ length: count }, (_, i) => edate(first, i))
}
