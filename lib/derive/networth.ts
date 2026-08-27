import type { EgpMinor } from '../money/types'
import { investmentTotal, liquidTotal, shortTermLiabilities } from './totals'
import type { HoldingsByClass, LiabilityLike, PropertyHoldingLike } from './types'

/**
 * `Net Worth!B12:B20` (T049).
 *
 * **Returns both figures, and neither is named plain "net worth"** (D4,
 * FR-036, FR-037). The sheet displays only `B20` — net worth excluding future
 * installments — while `B19`, which includes them, sits one row above and is
 * 8.2 million EGP lower. A caller that reaches for a field called `netWorth`
 * would get whichever one the author happened to pick; there is no such field,
 * so the choice has to be made deliberately at every call site.
 *
 * `excludingInstallments` must never be presented without stating what it
 * omits (FR-037). The field name carries that; a UI label has to as well.
 */
export interface NetWorth {
  readonly totalAssets: EgpMinor
  readonly shortTermLiabilities: EgpMinor
  readonly remainingInstallments: EgpMinor
  readonly totalLiabilities: EgpMinor
  /** `B20`. Excludes future property installments entirely. */
  readonly excludingInstallments: EgpMinor
  /** `B19`. Charges every future installment against today's assets. */
  readonly includingInstallments: EgpMinor
}

export interface NetWorthInput {
  readonly totalHoldings: HoldingsByClass
  readonly investmentHoldings: HoldingsByClass
  readonly propertyHoldings: readonly PropertyHoldingLike[]
  readonly liabilities: readonly LiabilityLike[]
  readonly remainingInstallments: EgpMinor
}

export function netWorth(input: NetWorthInput): NetWorth {
  const propertyPaid = input.propertyHoldings.reduce((sum, p) => sum + p.paidToDateMinor, 0)

  // `B12 = SUM(B4:B11)`: the four liquid class rows, the investment total, and
  // the three property rows. Property holdings are assets — the sheet's own
  // sum includes them, which is easy to miss because all three are zero today.
  const totalAssets =
    liquidTotal(input.totalHoldings) + investmentTotal(input.investmentHoldings) + propertyPaid

  const shortTerm = shortTermLiabilities(input.liabilities)
  const totalLiabilities = shortTerm + input.remainingInstallments

  return {
    totalAssets,
    shortTermLiabilities: shortTerm,
    remainingInstallments: input.remainingInstallments,
    totalLiabilities,
    excludingInstallments: totalAssets - shortTerm,
    includingInstallments: totalAssets - totalLiabilities,
  }
}
