import type { EgpMinor, IsoDate } from '../money/types'
import { edate, yearOf } from './dates'
import type { InstallmentLike } from './types'

/**
 * `Installments!H2:H10` (T050) and `Dashboard!I2:I22` (T051).
 *
 * Every field here is `TODAY()`-dependent in the sheet. `today` is an explicit
 * parameter, never a clock: that is what makes these functions deterministic
 * and therefore testable, and it is what stops one household member's overdue
 * count differing from another's (R8, FR-035).
 */

export interface InstallmentSummary {
  readonly totalScheduled: EgpMinor
  readonly totalPaid: EgpMinor
  readonly totalRemaining: EgpMinor
  readonly nextDueOn: IsoDate | null
  readonly nextAmountDue: EgpMinor
  readonly due3m: EgpMinor
  readonly due6m: EgpMinor
  readonly due12m: EgpMinor
  readonly overdue: EgpMinor
}

const isUnpaid = (i: InstallmentLike): boolean => i.paidAt === null

export function installmentSummary(
  installments: readonly InstallmentLike[],
  today: IsoDate,
): InstallmentSummary {
  let totalScheduled = 0
  let totalPaid = 0
  let totalRemaining = 0
  let overdue = 0
  let nextDueOn: IsoDate | null = null

  for (const installment of installments) {
    totalScheduled += installment.amountMinor
    if (isUnpaid(installment)) {
      totalRemaining += installment.amountMinor
      if (installment.dueOn < today) {
        overdue += installment.amountMinor
      } else if (nextDueOn === null || installment.dueOn < nextDueOn) {
        nextDueOn = installment.dueOn
      }
    } else {
      totalPaid += installment.amountMinor
    }
  }

  const windowSum = (months: number): EgpMinor => {
    // `EDATE` clamps to the last valid day of the target month, so a window
    // opened on 31 January closes on 28 or 29 February — never 2 March.
    const until = edate(today, months)
    let sum = 0
    for (const installment of installments) {
      if (!isUnpaid(installment)) continue
      if (installment.dueOn < today) continue
      if (installment.dueOn > until) continue
      sum += installment.amountMinor
    }
    return sum
  }

  let nextAmountDue = 0
  if (nextDueOn !== null) {
    for (const installment of installments) {
      if (isUnpaid(installment) && installment.dueOn === nextDueOn) {
        nextAmountDue += installment.amountMinor
      }
    }
  }

  return {
    totalScheduled,
    totalPaid,
    totalRemaining,
    nextDueOn,
    nextAmountDue,
    due3m: windowSum(3),
    due6m: windowSum(6),
    due12m: windowSum(12),
    overdue,
  }
}

export interface YearBucket {
  readonly year: number
  readonly amountMinor: EgpMinor
}

/**
 * The sheet's own spine, `Dashboard!H2:H22`. Kept as a constant rather than
 * derived from the data so the report has a stable 21-row shape to compare
 * against, and so a year with nothing in it still prints a zero.
 */
export const SHEET_YEAR_SPINE: readonly number[] = Array.from({ length: 21 }, (_, i) => 2025 + i)

/**
 * `Dashboard!I2:I22` (T051).
 *
 * Calendar-year buckets, not rolling windows — the sheet's formula is
 * `SUMIFS(..., ">="&DATE(y,1,1), "<"&DATE(y+1,1,1), unpaid)`, which is a
 * calendar year regardless of when it is evaluated.
 *
 * The buckets sum to `installmentSummary.totalRemaining` exactly. Both are
 * pure sums over the same unpaid set, so they agree to the piastre and neither
 * gets a tolerance (FR-029). An earlier draft of the contract recorded a
 * "1 EGP display-rounding artifact" here; that was the *goldens* being taken
 * from `display`. If a mismatch reappears it is a real defect — it is not
 * rounding.
 */
export function unpaidByYear(
  installments: readonly InstallmentLike[],
  years: readonly number[] = SHEET_YEAR_SPINE,
): YearBucket[] {
  return years.map((year) => {
    let amountMinor = 0
    for (const installment of installments) {
      if (!isUnpaid(installment)) continue
      if (yearOf(installment.dueOn) !== year) continue
      amountMinor += installment.amountMinor
    }
    return { year, amountMinor }
  })
}
