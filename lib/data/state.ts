import type { EgpMinor, IsoDate } from '../money/types'
import {
  assetMix,
  holdingsByClass,
  installmentSummary,
  investmentTotal,
  liquidTotal,
  monthlyRollup,
  netWorth,
  sheetMonthSpine,
  shortTermLiabilities,
  totalOfAll,
  transactionEgp,
  unpaidByYear,
} from '../derive/index'
import type {
  AccountLike,
  InstallmentLike,
  LiabilityLike,
  PropertyHoldingLike,
  RateRecord,
  TransactionLike,
} from '../derive/types'
import { rateAsOf } from '../rates/lookup'
import type { Repository } from './repository'

/**
 * `loadHouseholdState()` (T094).
 *
 * Composes the full payload from one batch of queries so feature 004's UI can
 * keep its one-round-trip contract (Principle VI). This feature ships no UI,
 * but the read shape is settled here rather than discovered later, because
 * discovering it later would mean changing every derivation's call site.
 *
 * Everything derived is computed here, at read time. Nothing derived is
 * stored (Principle I, FR-012).
 */

export interface SnapshotRow {
  readonly id: string
  readonly takenOn: IsoDate
  readonly liquidMinor: EgpMinor
  readonly investmentsMinor: EgpMinor
  readonly propertyPaidMinor: EgpMinor
  readonly shortTermLiabilitiesMinor: EgpMinor
  readonly remainingInstallmentsMinor: EgpMinor
  readonly netWorthExclInstallmentsMinor: EgpMinor
  /** NULL for imported rows — the sheet never recorded it, and it is not a zero. */
  readonly netWorthInclInstallmentsMinor: EgpMinor | null
  readonly source: string
}

export interface HouseholdState {
  readonly householdId: string
  readonly timezone: string
  readonly today: IsoDate
  readonly accounts: readonly AccountLike[]
  readonly propertyHoldings: readonly PropertyHoldingLike[]
  readonly liabilities: readonly LiabilityLike[]
  readonly installments: readonly InstallmentLike[]
  readonly transactions: ReadonlyArray<TransactionLike & { egpMinor: EgpMinor }>
  readonly rates: readonly RateRecord[]
  /** Dated historical fact, carried over and excluded from pass/fail (FR-032). */
  readonly snapshots: readonly SnapshotRow[]
  readonly derived: ReturnType<typeof deriveAll>
}

export function deriveAll(input: {
  accounts: readonly AccountLike[]
  propertyHoldings: readonly PropertyHoldingLike[]
  liabilities: readonly LiabilityLike[]
  installments: readonly InstallmentLike[]
  transactions: ReadonlyArray<TransactionLike & { egpMinor: EgpMinor }>
  rates: readonly RateRecord[]
  today: IsoDate
  months: readonly IsoDate[]
}) {
  const totalHoldings = holdingsByClass(input.accounts, input.rates, {
    isInvestment: false,
    today: input.today,
  })
  const investmentHoldings = holdingsByClass(input.accounts, input.rates, {
    isInvestment: true,
    today: input.today,
  })

  const installments = installmentSummary(input.installments, input.today)

  return {
    totalHoldings,
    investmentHoldings,
    liquidTotal: liquidTotal(totalHoldings),
    shortTermLiabilities: shortTermLiabilities(input.liabilities),
    totalOfAll: totalOfAll(totalHoldings, input.liabilities),
    investmentTotal: investmentTotal(investmentHoldings),
    netWorth: netWorth({
      totalHoldings,
      investmentHoldings,
      propertyHoldings: input.propertyHoldings,
      liabilities: input.liabilities,
      remainingInstallments: installments.totalRemaining,
    }),
    installmentSummary: installments,
    unpaidByYear: unpaidByYear(input.installments),
    assetMix: assetMix(totalHoldings, investmentHoldings, input.propertyHoldings),
    monthlyRollup: monthlyRollup(input.transactions, input.months),
  }
}

export async function loadHouseholdState(
  repository: Repository,
  options: { today: IsoDate; months?: readonly IsoDate[] },
): Promise<HouseholdState> {
  const [accounts, propertyHoldings, liabilities, installments, rawTransactions, rates, snapshotRows] =
    await Promise.all([
      repository.holdings.accounts(),
      repository.holdings.propertyHoldings(),
      repository.holdings.liabilities(),
      repository.ledger.installments(),
      repository.ledger.transactions(),
      repository.rates.all(),
      repository.history.snapshots(),
    ])

  const snapshots: SnapshotRow[] = snapshotRows.map((row) => ({
    id: row.id,
    takenOn: row.takenOn,
    liquidMinor: row.liquidMinor,
    investmentsMinor: row.investmentsMinor,
    propertyPaidMinor: row.propertyPaidMinor,
    shortTermLiabilitiesMinor: row.shortTermLiabilitiesMinor,
    remainingInstallmentsMinor: row.remainingInstallmentsMinor,
    netWorthExclInstallmentsMinor: row.netWorthExclInstallmentsMinor,
    netWorthInclInstallmentsMinor: row.netWorthInclInstallmentsMinor,
    source: row.source,
  }))

  const rateById = new Map(rates.map((r) => [r.id, r]))
  const transactions = rawTransactions.map((transaction) => ({
    ...transaction,
    // The rate is the one pinned by the transaction, not today's (D6, FR-042).
    // A transaction whose pinned rate is missing is a broken foreign key, not
    // a missing-rate condition, so it fails here rather than resolving forward.
    egpMinor: transactionEgp(
      transaction,
      transaction.rateId === null ? null : (rateById.get(transaction.rateId) ?? null),
    ),
  }))

  const months =
    options.months ??
    (transactions.length > 0
      ? sheetMonthSpine(transactions[0]!.occurredOn)
      : sheetMonthSpine(options.today))

  return {
    householdId: repository.context.householdId,
    timezone: repository.context.timezone,
    today: options.today,
    accounts,
    propertyHoldings,
    liabilities,
    installments,
    transactions,
    rates,
    snapshots,
    derived: deriveAll({
      accounts,
      propertyHoldings,
      liabilities,
      installments,
      transactions,
      rates,
      today: options.today,
      months,
    }),
  }
}

export { rateAsOf }
