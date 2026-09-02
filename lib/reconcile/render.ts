import type { AccountBalance } from '../data/accounts'
import Decimal from 'decimal.js'
import type { ReportLine, Verdict } from './verdict'

/**
 * Report rendering (T062, T079, T087).
 *
 * Every line prints all nine fields. Two of them are load-bearing:
 *
 * - **`difference` is mandatory and carries the observed size**, not a boolean
 *   within-bounds (FR-031). A systematic drift must stay visible even when
 *   every individual line is inside its allowance (SC-008) — several lines
 *   drifting the same direction is a real defect hiding inside
 *   individually-acceptable numbers.
 * - **`tolerance` is printed explicitly on every line it applies to** (FR-030),
 *   so a reader can see how much room a figure had as well as how much it used.
 *
 * Figures print in **minor units**, taken from the dump's `value` and never
 * re-rounded (FR-046). A report that printed `109715.20` could not show a
 * one-piastre disagreement, which is the only kind it exists to catch. A
 * human-readable EGP rendering follows in parentheses; it does not replace the
 * minor-unit figure.
 */

export const LINE_FIELDS = [
  'sheet_ref',
  'label',
  'sheet_value',
  'computed_value',
  'difference',
  'conversions',
  'tolerance',
  'verdict',
  'note',
] as const

export interface RenderOptions {
  /** Balance modes, so a derived balance is distinguishable from a stated one. */
  readonly balances?: ReadonlyMap<string, AccountBalance>
  /** Rate ages, so the age of the rate in use is visible (FR-040, T087). */
  readonly rateAges?: ReadonlyMap<string, string>
}

export function renderLine(line: ReportLine, options: RenderOptions = {}): string[] {
  const note = decorateNote(line, options)
  return [
    `${'sheet_ref'.padEnd(16)} ${line.sheetRef}`,
    `${'label'.padEnd(16)} ${line.label}`,
    `${'sheet_value'.padEnd(16)} ${renderValue(line, line.sheetValue)}`,
    `${'computed_value'.padEnd(16)} ${renderValue(line, line.computedValue)}`,
    `${'difference'.padEnd(16)} ${renderDifference(line)}`,
    `${'conversions'.padEnd(16)} ${line.conversions}`,
    `${'tolerance'.padEnd(16)} ${line.tolerance}`,
    `${'verdict'.padEnd(16)} ${line.verdict}`,
    `${'note'.padEnd(16)} ${note}`,
  ]
}

/** A compact one-line-per-figure table, for reading a whole tab at a glance. */
export function renderTable(lines: readonly ReportLine[], options: RenderOptions = {}): string[] {
  const rows = lines.map((line) => [
    line.sheetRef,
    line.label,
    renderValue(line, line.sheetValue),
    renderValue(line, line.computedValue),
    renderDifference(line),
    String(line.conversions),
    line.tolerance,
    line.verdict,
    decorateNote(line, options),
  ])

  const header = ['sheet_ref', 'label', 'sheet_value', 'computed_value', 'difference', 'conv', 'tolerance', 'verdict', 'note']
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => (row[index] ?? '').length)),
  )

  const format = (cells: readonly string[]): string =>
    cells.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  ').trimEnd()

  return [format(header), format(widths.map((w) => '-'.repeat(w))), ...rows.map(format)]
}

function renderValue(line: ReportLine, value: number | string | null): string {
  if (value === null) return '(not recorded)'
  if (typeof value === 'string') return value

  if (line.kind === 'ratio') return String(value)
  if (line.kind === 'count') return String(value)

  // Minor units first, always. The parenthesised major-unit rendering is a
  // convenience and may not replace it.
  return `${value} (${majorUnits(value)} EGP)`
}

function renderDifference(line: ReportLine): string {
  if (typeof line.difference === 'string') return line.difference
  if (line.kind === 'money') {
    const sign = line.difference > 0 ? '+' : ''
    return `${sign}${line.difference}`
  }
  return String(line.difference)
}

function decorateNote(line: ReportLine, options: RenderOptions): string {
  const extras: string[] = []

  // US2 acceptance scenario 7: a derived balance must be distinguishable from
  // a stated one wherever a balance is shown.
  const balance = options.balances?.get(line.sheetRef)
  if (balance !== undefined) {
    extras.push(`balance ${balance.mode} — ${balance.basis}`)
  }

  // FR-040: the age of the rate in use is determinable wherever a converted
  // figure is shown. A skipped fetch must never look like a current rate.
  if (line.conversions > 0) {
    const age = options.rateAges?.get(line.sheetRef) ?? options.rateAges?.get('*')
    if (age !== undefined) extras.push(`rate age ${age}`)
  }

  if (extras.length === 0) return line.note
  if (line.note === '—') return extras.join('; ')
  return `${line.note} [${extras.join('; ')}]`
}

export function majorUnits(minor: number): string {
  return new Decimal(minor).times(Decimal.pow(10, -2)).toFixed(2)
}

export function countVerdicts(lines: readonly ReportLine[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = {
    PASS: 0,
    'PASS (tolerance)': 0,
    DIVERGED: 0,
    CARRIED: 0,
    FAIL: 0,
  }
  for (const line of lines) counts[line.verdict] += 1
  return counts
}
