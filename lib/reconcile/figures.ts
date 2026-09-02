import type { HouseholdState } from '../data/state'
import type { Dump } from '../import/dump'
import { toMinor } from '../money/round'
import type { EgpMinor } from '../money/types'
import { judge, type FigureKind, type ReportLine } from './verdict'

/**
 * Every figure the report compares (T062 input).
 *
 * The computed side comes from the database, through the derivations. The
 * sheet side comes from the dump's `value` field, converted to minor units by
 * the same half-up rounding — never from `display`, and never re-rounded for
 * presentation (FR-046).
 *
 * Lines are grouped by source tab, in sheet order.
 */

export interface FigureGroup {
  readonly sheet: string
  readonly lines: ReportLine[]
}

export function buildFigures(dump: Dump, state: HouseholdState): FigureGroup[] {
  const d = state.derived

  const sheetMoney = (sheetName: string, a1: string): EgpMinor | null => {
    const value = dump.sheet(sheetName).numberAt(a1)
    return value === undefined ? null : toMinor(value, 'EGP')
  }

  const line = (
    sheetName: string,
    a1: string,
    label: string,
    computed: number | string | null,
    options: {
      conversions?: number
      kind?: FigureKind
      sheetValue?: number | string | null
      carried?: boolean
      note?: string
    } = {},
  ): ReportLine =>
    judge({
      sheetRef: `${sheetName}!${a1}`,
      label,
      kind: options.kind ?? 'money',
      sheetValue: options.sheetValue !== undefined ? options.sheetValue : sheetMoney(sheetName, a1),
      computedValue: computed,
      conversions: options.conversions,
      carried: options.carried,
      note: options.note,
    })

  const total = d.totalHoldings
  const investment = d.investmentHoldings
  const conv = (converted: boolean): number => (converted ? 1 : 0)

  // Conversions that actually occurred, counted rather than assumed. Gold and
  // silver are zero on the non-investment partition today, so `totalAssets`
  // performs four conversions and not six — but writing `4` here would be a
  // figure that silently stops being true the moment a holding changes, and
  // an inflated tolerance is exactly what lets a real error hide (R2).
  const liquidConversions =
    conv(total.USD.converted) + conv(total.GOLD.converted) + conv(total.SILVER.converted)
  const investmentConversions =
    conv(investment.USD.converted) +
    conv(investment.GOLD.converted) +
    conv(investment.SILVER.converted)
  const assetConversions = liquidConversions + investmentConversions

  // --- Dashboard -----------------------------------------------------------
  const dashboard: ReportLine[] = [
    line('Dashboard', 'B3', 'Net worth, excluding future installments', d.netWorth.excludingInstallments, {
      conversions: assetConversions,
      note: 'Re-exposes Net Worth!B20. Never presented unqualified (D4, FR-037).',
    }),
    line('Dashboard', 'B4', 'Total assets', d.netWorth.totalAssets, {
      conversions: assetConversions,
    }),
    line('Dashboard', 'B5', 'Liquid (EGP equivalent)', d.liquidTotal, {
      conversions: liquidConversions,
    }),
    line('Dashboard', 'B6', 'Investments (in EGP)', d.investmentTotal, {
      conversions: investmentConversions,
    }),
    line('Dashboard', 'B7', 'Short-term liabilities', d.shortTermLiabilities),
    line('Dashboard', 'B8', 'Remaining installments', d.installmentSummary.totalRemaining),
    line('Dashboard', 'B9', 'Next installment due', d.installmentSummary.nextDueOn, {
      kind: 'date',
      sheetValue: dump.sheet('Dashboard').dateAt('B9', dump.sourceTimeZone) ?? null,
    }),
    line('Dashboard', 'C9', 'Next amount due', d.installmentSummary.nextAmountDue),
    line('Dashboard', 'B10', 'Installments due next 12 months', d.installmentSummary.due12m),
    line('Dashboard', 'B11', 'Overdue / unpaid installments', d.installmentSummary.overdue),
    line('Dashboard', 'B12', 'USD / EGP rate', usdRateMajor(state), {
      kind: 'ratio',
      sheetValue: dump.sheet('Dashboard').numberAt('B12') ?? null,
      note: 'A dated record now, not a live lookup (D5, FR-041).',
    }),
  ]

  for (const row of d.assetMix) {
    const a1 = row.sheetRef.split('!')[1] as string
    dashboard.push(
      line('Dashboard', a1, row.label, row.egpMinor, { conversions: row.conversions }),
    )
  }

  for (const [index, bucket] of d.unpaidByYear.entries()) {
    const row = index + 2
    dashboard.push(
      line('Dashboard', `I${row}`, `Unpaid installments due in ${bucket.year}`, bucket.amountMinor),
    )
  }

  // --- Total ---------------------------------------------------------------
  const totalLines: ReportLine[] = [
    rateLine(dump, state, 'Total', 'A2', 'Dollar rate', 'USD'),
    rateLine(dump, state, 'Total', 'B2', 'Gold gram rate', 'GOLD'),
    rateLine(dump, state, 'Total', 'C2', 'Silver gram rate', 'SILVER'),
    nativeLine(dump, 'Total', 'D2', 'Total USD held', total.USD.nativeMinor, 'USD'),
    line('Total', 'E2', 'Total USD in EGP', total.USD.egpMinor, { conversions: conv(total.USD.converted) }),
    nativeLine(dump, 'Total', 'F2', 'Total gold held', total.GOLD.nativeMinor, 'GOLD'),
    line('Total', 'G2', 'Total gold in EGP', total.GOLD.egpMinor, { conversions: conv(total.GOLD.converted) }),
    nativeLine(dump, 'Total', 'H2', 'Total silver held', total.SILVER.nativeMinor, 'SILVER'),
    line('Total', 'I2', 'Total silver in EGP', total.SILVER.egpMinor, { conversions: conv(total.SILVER.converted) }),
    line('Total', 'J2', 'Total EGP', total.EGP.egpMinor),
    line('Total', 'K2', 'Credit (short-term liabilities)', d.shortTermLiabilities),
    line('Total', 'L2', 'Total of All in EGP', d.totalOfAll, {
      conversions: liquidConversions,
      note: 'Excludes investments, despite the sheet label.',
    }),
  ]

  // Hand-typed liability rows: imported verbatim, nothing to compute (FR-007).
  for (const [index, liability] of state.liabilities.entries()) {
    const row = index + 4
    totalLines.push(
      line('Total', `J${row}`, `Liability — ${liability.name}`, liability.amountMinor, {
        carried: true,
        note: 'Hand-typed in the sheet; imported verbatim.',
      }),
    )
  }

  // --- Installments --------------------------------------------------------
  const s = d.installmentSummary
  const installmentLines: ReportLine[] = [
    line('Installments', 'H2', 'Total scheduled', s.totalScheduled),
    line('Installments', 'H3', 'Total paid', s.totalPaid),
    line('Installments', 'H4', 'Total remaining', s.totalRemaining),
    line('Installments', 'H5', 'Next due date', s.nextDueOn, {
      kind: 'date',
      sheetValue: dump.sheet('Installments').dateAt('H5', dump.sourceTimeZone) ?? null,
    }),
    line('Installments', 'H6', 'Next amount due', s.nextAmountDue),
    line('Installments', 'H7', 'Due next 3 months', s.due3m),
    line('Installments', 'H8', 'Due next 6 months', s.due6m),
    line('Installments', 'H9', 'Due next 12 months', s.due12m),
    line('Installments', 'H10', 'Overdue (unpaid)', s.overdue),
  ]

  // --- Investment ----------------------------------------------------------
  const investmentLines: ReportLine[] = [
    rateLine(dump, state, 'Investment', 'A2', 'Dollar rate', 'USD'),
    rateLine(dump, state, 'Investment', 'B2', 'Gold gram rate', 'GOLD'),
    rateLine(dump, state, 'Investment', 'C2', 'Silver gram rate', 'SILVER'),
    nativeLine(dump, 'Investment', 'D2', 'Investment USD held', investment.USD.nativeMinor, 'USD'),
    line('Investment', 'E2', 'Investment USD in EGP', investment.USD.egpMinor, {
      conversions: conv(investment.USD.converted),
    }),
    nativeLine(dump, 'Investment', 'F2', 'Investment gold held', investment.GOLD.nativeMinor, 'GOLD'),
    nativeLine(dump, 'Investment', 'G2', 'Investment silver held', investment.SILVER.nativeMinor, 'SILVER'),
    line('Investment', 'H2', 'Investment gold in EGP', investment.GOLD.egpMinor, {
      conversions: conv(investment.GOLD.converted),
    }),
    line('Investment', 'I2', 'Investment silver in EGP', investment.SILVER.egpMinor, {
      conversions: conv(investment.SILVER.converted),
    }),
    line('Investment', 'J2', 'Investment EGP', investment.EGP.egpMinor),
    line('Investment', 'K2', 'Total investments in EGP', d.investmentTotal, {
      conversions: investmentConversions,
    }),
  ]

  // --- Net Worth -----------------------------------------------------------
  const netWorthLines: ReportLine[] = [
    line('Net Worth', 'B4', 'Liquid — EGP accounts & cash', total.EGP.egpMinor),
    line('Net Worth', 'B5', 'Liquid — USD (in EGP)', total.USD.egpMinor, {
      conversions: conv(total.USD.converted),
    }),
    line('Net Worth', 'B6', 'Liquid — Gold (in EGP)', total.GOLD.egpMinor, {
      conversions: conv(total.GOLD.converted),
    }),
    line('Net Worth', 'B7', 'Liquid — Silver (in EGP)', total.SILVER.egpMinor, {
      conversions: conv(total.SILVER.converted),
    }),
    line('Net Worth', 'B8', 'Investments (in EGP)', d.investmentTotal, {
      conversions: investmentConversions,
    }),
    line('Net Worth', 'B12', 'TOTAL ASSETS', d.netWorth.totalAssets, {
      conversions: assetConversions,
    }),
    line('Net Worth', 'B15', 'Short-term liabilities', d.netWorth.shortTermLiabilities),
    line('Net Worth', 'B16', 'Remaining property installments', d.netWorth.remainingInstallments),
    line('Net Worth', 'B17', 'TOTAL LIABILITIES', d.netWorth.totalLiabilities),
    line('Net Worth', 'B19', 'NET WORTH (after all future installments)', d.netWorth.includingInstallments, {
      conversions: assetConversions,
      note: 'The figure the sheet computes but never displays (D4).',
    }),
    line('Net Worth', 'B20', 'NET WORTH (current, excl. future installments)', d.netWorth.excludingInstallments, {
      conversions: assetConversions,
      note: 'Never to be presented as an unqualified "net worth" (FR-037).',
    }),
  ]

  for (const [index, property] of state.propertyHoldings.entries()) {
    const row = index + 9
    netWorthLines.push(
      line('Net Worth', `B${row}`, property.name, property.paidToDateMinor, {
        carried: true,
        note: 'Hand-typed in the sheet; imported verbatim.',
      }),
    )
  }

  // --- Transactions --------------------------------------------------------
  const transactionLines: ReportLine[] = []
  for (const [index, transaction] of state.transactions.entries()) {
    const row = index + 2
    transactionLines.push(
      line('Transactions', `G${row}`, `Transaction ${transaction.occurredOn} in EGP`, transaction.egpMinor, {
        conversions: transaction.currency === 'EGP' ? 0 : 1,
        note: 'Frozen at the rate in force on its own date (D6, FR-042).',
      }),
    )
  }

  for (const [index, month] of d.monthlyRollup.entries()) {
    const row = index + 2
    transactionLines.push(
      line('Transactions', `J${row}`, `Rollup month ${index + 1} of ${d.monthlyRollup.length}`, month.month, {
        kind: 'date',
        sheetValue: dump.sheet('Transactions').dateAt(`J${row}`, dump.sourceTimeZone) ?? null,
        note:
          index === 0
            ? 'The spine is a parameter here, not a hard-coded forward 24 months.'
            : '—',
      }),
      line('Transactions', `K${row}`, `Income — ${month.month}`, month.incomeMinor, {
        conversions: month.incomeMinor === 0 ? 0 : 1,
      }),
      line('Transactions', `L${row}`, `Expenses — ${month.month}`, month.expenseMinor),
      line('Transactions', `M${row}`, `Net saved — ${month.month}`, month.netMinor, {
        conversions: month.netMinor === 0 ? 0 : 1,
      }),
      line('Transactions', `N${row}`, `Savings rate — ${month.month}`, month.savingsRate, {
        kind: 'ratio',
        sheetValue: ratioAt(dump, 'Transactions', `N${row}`),
        note: month.savingsRate === null ? 'No income that month; null, never 0.' : '—',
      }),
    )
  }

  return [
    { sheet: 'Dashboard', lines: dashboard },
    { sheet: 'Total', lines: totalLines },
    { sheet: 'Installments', lines: installmentLines },
    { sheet: 'Investment', lines: investmentLines },
    { sheet: 'Net Worth', lines: netWorthLines },
    { sheet: 'Transactions', lines: transactionLines },
  ]
}

/** A native (non-EGP) quantity, compared at that class's own scale. */
function nativeLine(
  dump: Dump,
  sheetName: string,
  a1: string,
  label: string,
  computed: number,
  assetClass: 'USD' | 'GOLD' | 'SILVER',
): ReportLine {
  const raw = dump.sheet(sheetName).numberAt(a1)
  return judge({
    sheetRef: `${sheetName}!${a1}`,
    label: `${label} (${assetClass === 'USD' ? 'cents' : 'milligrams'})`,
    kind: 'count',
    sheetValue: raw === undefined ? null : toMinor(raw, assetClass),
    computedValue: computed,
    note: 'A summation over stated balances. No tolerance (FR-029).',
  })
}

/** A rate mirrored onto a tab. Compared in major units, as the sheet shows it. */
function rateLine(
  dump: Dump,
  state: HouseholdState,
  sheetName: string,
  a1: string,
  label: string,
  assetClass: 'USD' | 'GOLD' | 'SILVER',
): ReportLine {
  const rate = state.rates.find((r) => r.assetClass === assetClass) ?? null
  return judge({
    sheetRef: `${sheetName}!${a1}`,
    label,
    kind: 'ratio',
    sheetValue: dump.sheet(sheetName).numberAt(a1) ?? null,
    computedValue: rate === null ? null : majorOf(rate.rateMinor, rate.scale),
    note: 'A dated record now, not a live lookup (D5, FR-041).',
  })
}

function usdRateMajor(state: HouseholdState): number | null {
  const rate = state.rates.find((r) => r.assetClass === 'USD')
  return rate === undefined ? null : majorOf(rate.rateMinor, rate.scale)
}

function majorOf(rateMinor: number, scale: number): number {
  return Number((rateMinor * Math.pow(10, -scale)).toFixed(scale))
}

function ratioAt(dump: Dump, sheetName: string, a1: string): number | null {
  const value = dump.sheet(sheetName).valueAt(a1)
  // The sheet's `IFERROR(..., "")` is "no value", not zero.
  if (typeof value === 'number') return value
  return null
}
