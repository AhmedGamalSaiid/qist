import { DEFAULT_DUMP_PATH, Dump } from '../../lib/import/dump'
import { mapAccounts, mapInstallments, mapLiabilities, mapPropertyHoldings, mapRates } from '../../lib/import/mappers'
import { sheetMonthSpine } from '../../lib/derive/transactions'
import type {
  AccountLike,
  InstallmentLike,
  LiabilityLike,
  PropertyHoldingLike,
  RateRecord,
} from '../../lib/derive/types'
import type { AssetClass, ConvertibleClass, IsoDate } from '../../lib/money/types'
import { GOLDEN_TODAY } from '../golden/expected.generated'

/**
 * Derivation inputs, mapped straight from the dump.
 *
 * Golden tests for pure derivations do not need a database: the derivations
 * take plain inputs by design. Keeping them driver-free means the goldens fail
 * for one reason only — the computation is wrong.
 *
 * `today` is pinned to 2026-08-27 and the USD rate to 50.2554 (R7). `Rates!B2`
 * is a live `GOOGLEFINANCE` lookup, so an unpinned suite would fail
 * intermittently for reasons unrelated to the code.
 */

export const FIXTURE_HOUSEHOLD_ID = 'FIXTUREHOUSEHOLD00000000AA'
export const FIXTURE_CREATED_AT = 1_787_000_000_000

export interface DerivationFixture {
  readonly dump: Dump
  readonly today: IsoDate
  readonly accounts: AccountLike[]
  readonly propertyHoldings: PropertyHoldingLike[]
  readonly liabilities: LiabilityLike[]
  readonly installments: InstallmentLike[]
  readonly rates: RateRecord[]
  readonly months: IsoDate[]
}

let cached: DerivationFixture | undefined

export function derivationFixture(): DerivationFixture {
  if (cached !== undefined) return cached

  const dump = Dump.fromFile(DEFAULT_DUMP_PATH)
  const h = FIXTURE_HOUSEHOLD_ID
  const at = FIXTURE_CREATED_AT

  cached = {
    dump,
    today: GOLDEN_TODAY,
    accounts: mapAccounts(dump, h, at).map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      assetClass: row.assetClass as AssetClass,
      isInvestment: row.isInvestment === 1,
      quantityMinor: row.quantityMinor,
      balanceMode: row.balanceMode,
      openingQuantityMinor: row.openingQuantityMinor,
      openingDate: row.openingDate,
    })),
    propertyHoldings: mapPropertyHoldings(dump, h, at).map((row) => ({
      id: row.id,
      name: row.name,
      paidToDateMinor: row.paidToDateMinor,
    })),
    liabilities: mapLiabilities(dump, h, at).map((row) => ({
      id: row.id,
      name: row.name,
      amountMinor: row.amountMinor,
    })),
    installments: mapInstallments(dump, h, at).map((row) => ({
      id: row.id,
      planName: row.planName,
      dueOn: row.dueOn,
      amountMinor: row.amountMinor,
      paidAt: row.paidAt,
    })),
    rates: mapRates(dump, h, at).map((row) => ({
      id: row.id,
      assetClass: row.assetClass as ConvertibleClass,
      rateMinor: row.rateMinor,
      scale: row.scale,
      asOf: row.asOf,
    })),
    months: sheetMonthSpine('2026-08-01'),
  }

  return cached
}
