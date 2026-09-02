import { convert, isRealConversion } from '../money/convert'
import { rateAsOf } from '../rates/lookup'
import {
  ASSET_CLASSES,
  type AssetClass,
  type EgpMinor,
  type IsoDate,
  type MinorUnits,
} from '../money/types'
import type {
  AccountLike,
  ClassPosition,
  HoldingsByClass,
  LiabilityLike,
  RateRecord,
} from './types'

/**
 * `Total!D2:J2` and `Investment!D2:J2` (T048).
 *
 * Partitions on `is_investment` — that is the sole difference between the
 * sheet's `Total` and `Investment` tabs, which are otherwise identical
 * formulas.
 *
 * **Accounts of kind `liability` are excluded from every class total, by a
 * deliberate filter.** The sheet achieves the same exclusion by accident:
 * `Total!J2` is `SUMIFS(Data!D:D, Data!B:B, "EGP", ...)`, which matches on the
 * literal class string, so a row whose class is `Liability` matches no SUMIFS
 * on any tab and falls out of every figure. Reproducing that by relying on a
 * string failing to match would be reproducing a defect: the moment someone
 * adds `Liability` to a class list, the balances would silently reappear
 * inside asset totals. Filtering on `kind` says what is meant (D7, FR-045).
 */
export function holdingsByClass(
  accounts: readonly AccountLike[],
  rates: readonly RateRecord[],
  options: { isInvestment: boolean; today: IsoDate },
): HoldingsByClass {
  const positions = {} as Record<AssetClass, ClassPosition>

  for (const assetClass of ASSET_CLASSES) {
    let nativeMinor: MinorUnits = 0
    for (const account of accounts) {
      if (account.kind !== 'asset') continue
      if (account.isInvestment !== options.isInvestment) continue
      if (account.assetClass !== assetClass) continue
      nativeMinor += account.quantityMinor
    }

    const rate = assetClass === 'EGP' ? null : rateAsOf(rates, assetClass, options.today)
    positions[assetClass] = {
      nativeMinor,
      egpMinor: convert(nativeMinor, assetClass, rate),
      converted: isRealConversion(nativeMinor, assetClass),
    }
  }

  return positions
}

/**
 * A row whose id appears as another row's `reverses_id` stops contributing;
 * the correcting row contributes instead (004, data-model.md — the same
 * reversed-entry rule `lib/data/corrections.ts`'s `netEntries` applies to
 * `transactions`, restated here rather than imported so `lib/derive/` stays
 * driver-free and import-cycle-free against `lib/data/`).
 *
 * The identity on data with no reversals — every fresh import of the dump —
 * which is why every 003 golden figure is unchanged (spec FR-024, SC-008).
 */
export function nonReversed<T extends { id: string; reversesId: string | null }>(
  rows: readonly T[],
): T[] {
  const reversed = new Set(rows.map((r) => r.reversesId).filter((id): id is string => id !== null))
  return rows.filter((row) => !reversed.has(row.id))
}

/** `Total!K2 = SUM(J4:J10)`. A plain sum: no tolerance, ever (FR-029). */
export function shortTermLiabilities(liabilities: readonly LiabilityLike[]): EgpMinor {
  return nonReversed(liabilities).reduce((sum, l) => sum + l.amountMinor, 0)
}

/**
 * `Total!L2 = E2+G2+I2+J2-K2` (T048).
 *
 * Non-investment holdings **minus** short-term liabilities, and **excluding**
 * investments — despite the sheet's "Total of All in EGP" label. The label is
 * wrong about what the formula does; the formula is what was ported.
 */
export function totalOfAll(
  holdings: HoldingsByClass,
  liabilities: readonly LiabilityLike[],
): EgpMinor {
  return (
    holdings.USD.egpMinor +
    holdings.GOLD.egpMinor +
    holdings.SILVER.egpMinor +
    holdings.EGP.egpMinor -
    shortTermLiabilities(liabilities)
  )
}

/** `Investment!K2 = E2+H2+J2+I2`. */
export function investmentTotal(holdings: HoldingsByClass): EgpMinor {
  return (
    holdings.USD.egpMinor +
    holdings.GOLD.egpMinor +
    holdings.EGP.egpMinor +
    holdings.SILVER.egpMinor
  )
}

/**
 * `Dashboard!B5 = SUM('Net Worth'!B4:B7)` and `History!B2` — the liquid
 * position in EGP equivalent.
 *
 * Not named in `contracts/derivations.md`, but the coverage matrix has to
 * assign `Dashboard!B5` an owner and this is what it computes: the four
 * non-investment class totals, converted. Marking it `EXCLUDED` would have
 * been the alternative, and it is a figure the dashboard displays, so it gets
 * a derivation and a report line rather than an exclusion note.
 */
export function liquidTotal(holdings: HoldingsByClass): EgpMinor {
  return (
    holdings.EGP.egpMinor +
    holdings.USD.egpMinor +
    holdings.GOLD.egpMinor +
    holdings.SILVER.egpMinor
  )
}

/** How many real conversions a set of class positions performed. */
export function conversionsIn(...positions: readonly ClassPosition[]): number {
  return positions.filter((p) => p.converted).length
}
