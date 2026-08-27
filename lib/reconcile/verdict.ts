import type { EgpMinor } from '../money/types'

/**
 * The report line model and all five verdict rules (T061).
 *
 * | Verdict            | Meaning                                        | Blocks |
 * |--------------------|------------------------------------------------|--------|
 * | `PASS`             | Computed equals the spreadsheet exactly        | no     |
 * | `PASS (tolerance)` | Differs within the allowance, and by how much  | no     |
 * | `DIVERGED`         | Registered correction of a known defect        | no     |
 * | `CARRIED`          | Imported verbatim — nothing to compute against | no     |
 * | `FAIL`             | Anything else                                  | **yes**|
 *
 * `CARRIED` earns its place: FR-007 requires a hand-typed cell to be
 * distinguishable from a verified calculation, and without a verdict of its
 * own a typed value prints as a `PASS` the report never actually proved.
 */

export const VERDICTS = ['PASS', 'PASS (tolerance)', 'DIVERGED', 'CARRIED', 'FAIL'] as const
export type Verdict = (typeof VERDICTS)[number]

export function blocksCompletion(verdict: Verdict): boolean {
  return verdict === 'FAIL'
}

/**
 * Tolerance is **±1 minor unit per conversion that actually occurred** (R2,
 * FR-030).
 *
 * `conversions` counts real conversions, not conversion terms present in the
 * formula. `Total!L2` is `E2+G2+I2+J2-K2`, which has three conversion-bearing
 * terms, but gold and silver are zero on the non-investment partition and a
 * zero quantity converts exactly — so it is 1, and the tolerance is ±1
 * piastre. Counting terms would inflate the allowance and let a genuine error
 * hide inside it. A figure whose every conversion input is zero has
 * `conversions 0` and must reconcile exactly.
 *
 * Exported so the goldens and the report share one rule; a literal pinned in a
 * test would drift from it silently.
 */
export function toleranceFor(conversions: number): number {
  return Math.max(0, conversions)
}

export function formatTolerance(conversions: number): string {
  const tolerance = toleranceFor(conversions)
  if (tolerance === 0) return 'exact'
  return `±${tolerance} piastre${tolerance === 1 ? '' : 's'}`
}

/** What kind of thing a line compares. Not everything on the report is money. */
export type FigureKind = 'money' | 'date' | 'ratio' | 'count'

export interface FigureInput {
  readonly sheetRef: string
  readonly label: string
  readonly kind: FigureKind
  readonly sheetValue: number | string | null
  readonly computedValue: number | string | null
  /** Conversions that actually occurred in producing the computed value. */
  readonly conversions?: number
  /** Set when the figure is imported verbatim rather than computed (FR-007). */
  readonly carried?: boolean
  readonly note?: string
}

export interface ReportLine {
  readonly sheetRef: string
  readonly label: string
  readonly kind: FigureKind
  readonly sheetValue: number | string | null
  readonly computedValue: number | string | null
  /**
   * Mandatory on every line, and it carries the **observed** size rather than
   * a boolean within-bounds (FR-031). A systematic drift must stay visible
   * even when each line is individually in bounds (SC-008).
   */
  readonly difference: number | string
  readonly conversions: number
  readonly tolerance: string
  readonly verdict: Verdict
  readonly note: string
}

const EPSILON = 1e-9

export function judge(input: FigureInput): ReportLine {
  const conversions = input.conversions ?? 0
  const tolerance = toleranceFor(conversions)

  const { difference, exact, within } = compare(input, tolerance)

  let verdict: Verdict
  if (input.carried === true) {
    // A carried value still has to round-trip: it was typed into the sheet and
    // read back out of the database, and those must agree. What it does not
    // have is a computation behind it, which is what `CARRIED` says.
    verdict = exact ? 'CARRIED' : 'FAIL'
  } else if (exact) {
    verdict = 'PASS'
  } else if (within) {
    verdict = 'PASS (tolerance)'
  } else {
    verdict = 'FAIL'
  }

  return {
    sheetRef: input.sheetRef,
    label: input.label,
    kind: input.kind,
    sheetValue: input.sheetValue,
    computedValue: input.computedValue,
    difference,
    conversions,
    tolerance: formatTolerance(conversions),
    verdict,
    note: input.note ?? '—',
  }
}

function compare(
  input: FigureInput,
  tolerance: number,
): { difference: number | string; exact: boolean; within: boolean } {
  const { sheetValue, computedValue, kind } = input

  if (sheetValue === null && computedValue === null) {
    return { difference: 0, exact: true, within: true }
  }
  if (sheetValue === null || computedValue === null) {
    return {
      difference: `sheet ${render(sheetValue)} vs computed ${render(computedValue)}`,
      exact: false,
      within: false,
    }
  }

  if (kind === 'ratio' && typeof sheetValue === 'number' && typeof computedValue === 'number') {
    // The one non-monetary figure. Compared with an explicit epsilon rather
    // than by equality, because it is a float by construction.
    const diff = Math.abs(sheetValue - computedValue)
    return { difference: diff, exact: diff < EPSILON, within: diff < EPSILON }
  }

  if (typeof sheetValue === 'number' && typeof computedValue === 'number') {
    const diff = computedValue - sheetValue
    return { difference: diff, exact: diff === 0, within: Math.abs(diff) <= tolerance }
  }

  const same = String(sheetValue) === String(computedValue)
  return {
    difference: same ? 0 : `sheet ${render(sheetValue)} vs computed ${render(computedValue)}`,
    exact: same,
    within: same,
  }
}

function render(value: number | string | null): string {
  if (value === null) return '(none)'
  return String(value)
}

/** A convenience for the common case: an exact monetary comparison. */
export function judgeMoney(
  sheetRef: string,
  label: string,
  sheetValue: EgpMinor | null,
  computedValue: EgpMinor | null,
  options: { conversions?: number; carried?: boolean; note?: string } = {},
): ReportLine {
  return judge({ sheetRef, label, kind: 'money', sheetValue, computedValue, ...options })
}
