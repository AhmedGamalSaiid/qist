/**
 * Registered divergences (T063, FR-049, R6).
 *
 * A divergence must be registered **before** the report runs. One discovered
 * afterwards is a `FAIL`, not a divergence — otherwise the register becomes a
 * place to explain away surprises, which FR-010 forbids outright.
 *
 * Each entry says whether it changes a number **today**, on the dump as
 * extracted. That distinction is load-bearing: a divergence with no current
 * numeric difference must not print a `DIVERGED` line, or the report teaches
 * its reader to skim past divergences as routine. Such entries are listed in a
 * section of their own and excluded from the verdict tally.
 *
 * **None of the four registered divergences prints a `DIVERGED` line on
 * today's data.** A `DIVERGED` line whose `difference` column reads `0` is a
 * defect in the report, not a finding.
 */

export interface RegisteredDivergence {
  readonly figure: string
  readonly divergence: string
  /** `null` when it changes no number today. */
  readonly numericDifferenceToday: number | null
  readonly authority: string
  readonly explanation: string
}

export const REGISTERED_DIVERGENCES: readonly RegisteredDivergence[] = Object.freeze([
  {
    figure: 'Transactions!G*',
    divergence: "Frozen at the transaction's own rate rather than the live one",
    numericDifferenceToday: null,
    authority: 'D6, FR-042',
    explanation:
      'The sole imported rate (as_of 2026-08-17, USD/EGP 50.2554) is also the live rate ' +
      'captured in the dump, and the sole transaction is dated 2026-08-24. Frozen-rate and ' +
      'live-rate evaluation therefore return the same 502554. From the moment a second USD ' +
      'rate is recorded, the sheet will restate this past transaction and this system will ' +
      'not — a real difference in behaviour that is not yet a difference in any number.',
  },
  {
    figure: 'Rates!B2',
    divergence: 'A dated record replaces the live GOOGLEFINANCE lookup',
    numericDifferenceToday: null,
    authority: 'D5, FR-041',
    explanation:
      'The sheet re-evaluates =GOOGLEFINANCE("CURRENCY:USDEGP") on every recalculation, so ' +
      'every figure downstream of it moves between one open and the next. The imported rate ' +
      'is the value captured at extraction, dated 2026-08-17. Same number today; ' +
      'reproducible from now on.',
  },
  {
    figure: 'History row 2',
    divergence: 'Excluded from import',
    numericDifferenceToday: null,
    authority: 'FR-012',
    explanation:
      'Row 2 is a live formula mirror of the Net Worth tab, not a snapshot. Importing it ' +
      'would persist a derived value and make the snapshot count 2 where it should be 1. ' +
      'Not a figure, so it has no verdict — it is reported as an explicit exclusion.',
  },
  {
    figure: 'Net worth headline',
    divergence: 'Both B19 and B20 exposed, neither named plain "net worth"',
    numericDifferenceToday: null,
    authority: 'D4, FR-036, FR-037',
    explanation:
      'The sheet displays only B20 and silently omits 8,214,605.20 EGP of committed ' +
      'installment liability. Both figures now reconcile against their own cells, so ' +
      'neither number changed — what changed is that neither can be presented unqualified.',
  },
])

export interface DivergenceSection {
  readonly behavioural: readonly RegisteredDivergence[]
  readonly numeric: readonly RegisteredDivergence[]
}

export function partitionDivergences(
  register: readonly RegisteredDivergence[] = REGISTERED_DIVERGENCES,
): DivergenceSection {
  return {
    behavioural: register.filter((d) => d.numericDifferenceToday === null),
    numeric: register.filter((d) => d.numericDifferenceToday !== null),
  }
}

/** Whether a figure has a registered divergence that changes a number today. */
export function numericDivergenceFor(
  sheetRef: string,
  register: readonly RegisteredDivergence[] = REGISTERED_DIVERGENCES,
): RegisteredDivergence | undefined {
  return register.find(
    (d) => d.numericDifferenceToday !== null && matchesFigure(d.figure, sheetRef),
  )
}

function matchesFigure(pattern: string, sheetRef: string): boolean {
  if (pattern.endsWith('*')) return sheetRef.startsWith(pattern.slice(0, -1))
  return pattern === sheetRef
}
