import type { EgpMinor } from '../money/types'
import type { HoldingsByClass, PropertyHoldingLike } from './types'

/**
 * `Dashboard!F2:F6` (T052) — the combined position per class, across both
 * partitions.
 *
 * `contracts/derivations.md` gives the signature as
 * `assetMix(totalHoldings, investmentHoldings)`, but its own table includes
 * `F6 = SUM('Net Worth'!B9:B11)`, which is the property row. Property
 * holdings are therefore a third input; leaving them out would have made `F6`
 * unownable and put a coverage gap in the matrix. All three property rows are
 * zero today, which is exactly why the omission was easy to miss.
 */
export interface AssetMixRow {
  /** The sheet's own label, so the report line reads as the dashboard does. */
  readonly label: string
  readonly sheetRef: string
  readonly egpMinor: EgpMinor
  /** Conversions that actually occurred in producing this row. */
  readonly conversions: number
}

export function assetMix(
  totalHoldings: HoldingsByClass,
  investmentHoldings: HoldingsByClass,
  propertyHoldings: readonly PropertyHoldingLike[],
): AssetMixRow[] {
  const combine = (
    label: string,
    sheetRef: string,
    key: keyof HoldingsByClass,
  ): AssetMixRow => {
    const a = totalHoldings[key]
    const b = investmentHoldings[key]
    return {
      label,
      sheetRef,
      egpMinor: a.egpMinor + b.egpMinor,
      conversions: (a.converted ? 1 : 0) + (b.converted ? 1 : 0),
    }
  }

  return [
    combine('EGP cash & accounts', 'Dashboard!F2', 'EGP'),
    combine('USD (in EGP)', 'Dashboard!F3', 'USD'),
    combine('Gold (in EGP)', 'Dashboard!F4', 'GOLD'),
    combine('Silver (in EGP)', 'Dashboard!F5', 'SILVER'),
    {
      label: 'Property (paid to date)',
      sheetRef: 'Dashboard!F6',
      egpMinor: propertyHoldings.reduce((sum, p) => sum + p.paidToDateMinor, 0),
      conversions: 0,
    },
  ]
}
