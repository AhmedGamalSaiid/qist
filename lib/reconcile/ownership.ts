/**
 * Which derivation owns which formula range (T013).
 *
 * The coverage matrix is **generated**, so the `owner` column cannot be filled
 * in by hand in `contracts/coverage.md` — `coverage:check` regenerates the file
 * and diffs it, and a hand-edited column would be wiped on the first
 * regeneration and then reported as drift. The assignments therefore live here,
 * in code, and the generator reads them.
 *
 * Every entry is a deliberate decision. A range with no entry is reported as
 * `UNASSIGNED` by the generator and fails `coverage:check`, so a formula cannot
 * be missed by omission.
 */

export interface Ownership {
  /** The derivation that replaces this range, or `EXCLUDED`. */
  readonly owner: string
  /** Required when `owner` is `EXCLUDED`. */
  readonly reason?: string
  /** The expected report verdict for the figure this range produces. */
  readonly verdict: string
}

export const UNASSIGNED = 'UNASSIGNED'

const T = (owner: string, verdict = 'PASS'): Ownership => ({ owner, verdict })
const X = (reason: string): Ownership => ({ owner: 'EXCLUDED', reason, verdict: '—' })

/** Keyed by `Sheet!Range`, where the range is the group's bounding box. */
export const OWNERSHIP: Readonly<Record<string, Ownership>> = Object.freeze({
  // --- Dashboard: mostly re-exposure of figures computed elsewhere. -------
  'Dashboard!F2': T('assetMix'),
  'Dashboard!F3': T('assetMix'),
  'Dashboard!F4': T('assetMix'),
  'Dashboard!F5': T('assetMix'),
  'Dashboard!F6': T('assetMix'),
  'Dashboard!I2:I22': T('unpaidByYear'),
  'Dashboard!B3': T('netWorth.excludingInstallments'),
  'Dashboard!B4': T('netWorth.totalAssets'),
  'Dashboard!B5': T('liquidTotal'),
  'Dashboard!B6': T('investmentTotal'),
  'Dashboard!B7': T('shortTermLiabilities'),
  'Dashboard!B8:B9': T('installmentSummary'),
  'Dashboard!C9': T('installmentSummary.nextAmountDue'),
  'Dashboard!B10:B11': T('installmentSummary'),
  'Dashboard!B12': T('rateAsOf'),

  // --- Total: the non-investment partition. ------------------------------
  'Total!A2': T('rateAsOf'),
  'Total!B2': T('rateAsOf'),
  'Total!C2': T('rateAsOf'),
  'Total!D2': T('holdingsByClass'),
  'Total!E2': T('holdingsByClass'),
  'Total!F2': T('holdingsByClass'),
  'Total!G2': T('holdingsByClass'),
  'Total!H2': T('holdingsByClass'),
  'Total!I2': T('holdingsByClass'),
  'Total!J2': T('holdingsByClass'),
  'Total!K2': T('shortTermLiabilities'),
  'Total!L2': T('totalOfAll'),

  // --- Installments: the nine summary figures. ---------------------------
  'Installments!H2': T('installmentSummary.totalScheduled'),
  'Installments!H3': T('installmentSummary.totalPaid'),
  'Installments!H4': T('installmentSummary.totalRemaining'),
  'Installments!H5': T('installmentSummary.nextDueOn'),
  'Installments!H6': T('installmentSummary.nextAmountDue'),
  'Installments!H7': T('installmentSummary.due3m'),
  'Installments!H8': T('installmentSummary.due6m'),
  'Installments!H9': T('installmentSummary.due12m'),
  'Installments!H10': T('installmentSummary.overdue'),

  // --- Investment: the same formulas, the other partition. ---------------
  'Investment!A2': T('rateAsOf'),
  'Investment!B2': T('rateAsOf'),
  'Investment!C2': T('rateAsOf'),
  'Investment!D2': T('holdingsByClass'),
  'Investment!E2': T('holdingsByClass'),
  'Investment!F2': T('holdingsByClass'),
  'Investment!G2': T('holdingsByClass'),
  'Investment!H2:I2': T('holdingsByClass'),
  'Investment!J2': T('holdingsByClass'),
  'Investment!K2': T('investmentTotal'),

  // --- Rates: the live lookup this feature replaces. ---------------------
  'Rates!B2': X(
    'A live GOOGLEFINANCE lookup, replaced by dated rate records (D5, FR-041). ' +
      'The value captured in the dump imports as the 2026-08-17 USD rate; no ' +
      'stored column may hold a live external lookup. Reported under ' +
      'Behavioural divergences.',
  ),

  // --- Net Worth. --------------------------------------------------------
  'Net Worth!B4': T('holdingsByClass'),
  'Net Worth!B5': T('holdingsByClass'),
  'Net Worth!B6': T('holdingsByClass'),
  'Net Worth!B7': T('holdingsByClass'),
  'Net Worth!B8': T('investmentTotal'),
  'Net Worth!B12': T('netWorth.totalAssets'),
  'Net Worth!B15': T('netWorth.shortTermLiabilities'),
  'Net Worth!B16': T('netWorth.remainingInstallments'),
  'Net Worth!B17': T('netWorth.totalLiabilities'),
  'Net Worth!B19': T('netWorth.includingInstallments'),
  'Net Worth!B20': T('netWorth.excludingInstallments'),

  // --- Transactions. -----------------------------------------------------
  'Transactions!G2:G500': T('transactionEgp'),
  'Transactions!J2': T('monthlyRollup.months'),
  'Transactions!J3:J25': T('monthlyRollup.months'),
  'Transactions!K2:K25': T('monthlyRollup.incomeMinor'),
  'Transactions!L2:L25': T('monthlyRollup.expenseMinor'),
  'Transactions!M2:M25': T('monthlyRollup.netMinor'),
  'Transactions!N2:N25': T('monthlyRollup.savingsRate'),

  // --- History row 2: a live mirror, not a snapshot. ---------------------
  'History!A2': X('History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012).'),
  'History!B2': X('History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012).'),
  'History!C2': X('History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012).'),
  'History!D2': X('History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012).'),
  'History!E2': X('History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012).'),
  'History!F2': X('History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012).'),
  'History!G2': X('History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012).'),
})

export function ownershipFor(key: string): Ownership {
  return OWNERSHIP[key] ?? { owner: UNASSIGNED, verdict: '—' }
}

/** Every distinct derivation named as an owner. This is the measured count. */
export function ownedDerivations(): string[] {
  const roots = new Set<string>()
  for (const entry of Object.values(OWNERSHIP)) {
    if (entry.owner === 'EXCLUDED') continue
    roots.add(entry.owner.split('.')[0] as string)
  }
  return [...roots].sort()
}
