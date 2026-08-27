import type { HouseholdState } from '../data/state'
import type { Dump } from '../import/dump'
import { oldestRateDescription } from '../rates/age'
import { enforceCoverage, excludedRanges, type CoverageEnforcement } from './coverage'
import {
  buildOpenDiscrepancies,
  loadDiscrepancies,
  type OpenDiscrepancy,
} from './discrepancies'
import { partitionDivergences, REGISTERED_DIVERGENCES } from './divergences'
import { buildFigures, type FigureGroup } from './figures'
import { countVerdicts, majorUnits, renderTable, type RenderOptions } from './render'
import { buildSnapshotSection, type SnapshotLine } from './snapshots'
import { buildUnreachableSection, type UnreachableInput, type UnreachableValue } from './unreachable'
import type { ReportLine, Verdict } from './verdict'

/**
 * The reconciliation report (T066).
 *
 * The artifact that decides whether the migration may complete (Principle X,
 * FR-006, FR-009). It must be readable start to finish by the owner without
 * assistance — SC-007 makes that a success criterion, not a nicety.
 */

export interface Report {
  readonly groups: FigureGroup[]
  readonly lines: ReportLine[]
  readonly counts: Record<Verdict, number>
  readonly behavioural: typeof REGISTERED_DIVERGENCES
  readonly unreachable: UnreachableValue[]
  readonly droppedUnreachable: UnreachableInput[]
  readonly snapshots: SnapshotLine[]
  readonly discrepancies: OpenDiscrepancy[]
  readonly coverage: CoverageEnforcement
  readonly gateOpen: boolean
  readonly text: string
}

export interface ReportOptions extends RenderOptions {
  readonly discrepanciesPath?: string
}

export function generateReport(
  dump: Dump,
  state: HouseholdState,
  options: ReportOptions = {},
): Report {
  const groups = buildFigures(dump, state)
  const lines = groups.flatMap((group) => group.lines)
  const counts = countVerdicts(lines)

  const { behavioural } = partitionDivergences()
  const unreachableInputs = unreachableFrom(dump, state)
  const { values: unreachable, dropped: droppedUnreachable } =
    buildUnreachableSection(unreachableInputs)
  const snapshots = buildSnapshotSection(state.snapshots)
  const discrepancies = buildOpenDiscrepancies(lines, loadDiscrepancies(options.discrepanciesPath))
  const coverage = enforceCoverage(dump, lines)

  // The gate is shut by any blocking discrepancy, any coverage gap, or any
  // value the source stores that the importer dropped. A clean-looking report
  // that quietly lost a number is the failure mode this exists to prevent.
  const gateOpen =
    discrepancies.every((d) => !d.blocking) && coverage.clean && droppedUnreachable.length === 0

  const rateAges = new Map(options.rateAges ?? [])
  if (!rateAges.has('*')) {
    const oldest = oldestRateDescription(state.rates, state.today)
    if (oldest !== undefined) rateAges.set('*', oldest)
  }

  const report: Omit<Report, 'text'> = {
    groups,
    lines,
    counts,
    behavioural,
    unreachable,
    droppedUnreachable,
    snapshots,
    discrepancies,
    coverage,
    gateOpen,
  }

  return { ...report, text: renderReport(dump, state, report, { ...options, rateAges }) }
}

function renderReport(
  dump: Dump,
  state: HouseholdState,
  report: Omit<Report, 'text'>,
  options: RenderOptions,
): string {
  const out: string[] = []

  out.push('RECONCILIATION REPORT')
  out.push('='.repeat(78))
  out.push('')
  out.push(`dump            migration/sheet-dump.json  (${dump.extractedAt})`)
  out.push(`household       ${state.householdId}`)
  out.push(`timezone        ${state.timezone}`)
  out.push(`today           ${state.today}`)
  for (const rate of state.rates) {
    out.push(
      `rate            ${rate.assetClass.padEnd(6)} ${rate.rateMinor} scale ${rate.scale}  as of ${rate.asOf}`,
    )
  }
  out.push('')
  out.push('All figures are in minor units, taken from the dump\'s `value` field and never')
  out.push('re-rounded. A report printing 109715.20 could not show a one-piastre')
  out.push('disagreement, which is the only kind this report exists to catch. The EGP')
  out.push('rendering in parentheses is a convenience, not the figure.')
  out.push('')

  // --- Figures, grouped by source tab in sheet order. ----------------------
  for (const group of report.groups) {
    if (group.lines.length === 0) continue
    out.push('')
    out.push(`-- ${group.sheet} ${'-'.repeat(Math.max(0, 74 - group.sheet.length))}`)
    out.push('')
    out.push(...renderTable(group.lines, options))
  }

  // --- Behavioural divergences (no current numeric difference). -----------
  out.push('')
  out.push('')
  out.push('BEHAVIOURAL DIVERGENCES (no current numeric difference)')
  out.push('-'.repeat(78))
  out.push('')
  out.push('Deliberate corrections of known spreadsheet defects, registered in advance.')
  out.push('None of these changes a number against this dump, so none prints a DIVERGED')
  out.push('line above and none counts toward the verdict tally. Should one ever produce a')
  out.push('difference, it moves into the figure table as DIVERGED — which is the point of')
  out.push('registering it beforehand.')
  out.push('')
  for (const divergence of report.behavioural) {
    out.push(`  ${divergence.figure}  [${divergence.authority}]`)
    out.push(`    ${divergence.divergence}`)
    out.push(...wrap(divergence.explanation, 74).map((l) => `      ${l}`))
    out.push('')
  }

  // --- Explicit exclusions from the coverage matrix. ----------------------
  const excluded = excludedRanges(dump)
  if (excluded.length > 0) {
    out.push('EXPLICIT EXCLUSIONS')
    out.push('-'.repeat(78))
    out.push('')
    out.push('Formula ranges deliberately not reported, each with its reason. A range')
    out.push('excluded without a reason is a coverage gap, and a coverage gap is a FAIL.')
    out.push('')
    const seen = new Set<string>()
    for (const row of excluded) {
      const label = `${row.key} (${row.count} cell${row.count === 1 ? '' : 's'})`
      const key = row.reason
      if (seen.has(key)) {
        out.push(`  ${label}`)
        continue
      }
      seen.add(key)
      out.push(`  ${label}`)
      out.push(...wrap(row.reason, 74).map((l) => `      ${l}`))
    }
    out.push('')
  }

  // --- Unreachable values. ------------------------------------------------
  out.push('')
  out.push('UNREACHABLE VALUES')
  out.push('-'.repeat(78))
  out.push('')
  out.push('Values the source stores that no formula in the workbook reads. They change no')
  out.push('figure, so they have no verdict — but discarding them silently would lose data')
  out.push('the owner entered. Zeros are listed too, so an empty section is unambiguous.')
  out.push('')
  if (report.unreachable.length === 0) {
    out.push('  (none)')
  }
  for (const value of report.unreachable) {
    out.push(`  source_ref       ${value.sourceRef}`)
    out.push(`  label            ${value.label}`)
    out.push(`  stored_value     ${value.storedMinor} (${majorUnits(value.storedMinor)} EGP)`)
    out.push(`  read_by          ${value.readBy}`)
    out.push(`  disposition      ${value.disposition}`)
    out.push('')
  }

  // --- Account balances, with the mode each was established under. --------
  out.push('')
  out.push('ACCOUNT BALANCES')
  out.push('-'.repeat(78))
  out.push('')
  out.push('Every balance shows how it was established (FR-028). A stated balance is the')
  out.push('number recorded on the account, which is what the spreadsheet does; a derived')
  out.push('one is an opening balance plus the net of entries since its opening date. The')
  out.push('two are not interchangeable, so the report never shows one without saying which.')
  out.push('')
  for (const account of state.accounts) {
    const basis =
      account.balanceMode === 'stated'
        ? 'stated on the account'
        : `opening ${account.openingQuantityMinor} on ${account.openingDate} plus entries since`
    out.push(
      `  ${account.name.padEnd(16)} ${String(account.quantityMinor).padStart(10)}  ` +
        `${account.assetClass.padEnd(6)} ${account.kind.padEnd(9)} ${account.balanceMode.padEnd(7)}  ${basis}`,
    )
  }
  out.push('')

  // --- Snapshots. ---------------------------------------------------------
  out.push('')
  out.push('HISTORICAL SNAPSHOTS (carried over, excluded from pass/fail)')
  out.push('-'.repeat(78))
  out.push('')
  out.push('A snapshot is a dated fact about a day whose holdings, rates and installment')
  out.push('schedule are not in this dump. Recomputing one would produce a large,')
  out.push('confident-looking difference that says nothing about whether the port is')
  out.push('faithful, so these are carried over rather than compared (FR-032, FR-033).')
  out.push('')
  for (const snapshot of report.snapshots) {
    out.push(`  ${snapshot.takenOn}  (${snapshot.source})`)
    out.push(`    liquid                      ${snapshot.liquidMinor}`)
    out.push(`    investments                 ${snapshot.investmentsMinor}`)
    out.push(`    property paid               ${snapshot.propertyPaidMinor}`)
    out.push(`    short-term liabilities      ${snapshot.shortTermLiabilitiesMinor}`)
    out.push(`    remaining installments      ${snapshot.remainingInstallmentsMinor}`)
    out.push(`    net worth excl installments ${snapshot.netWorthExclInstallmentsMinor}`)
    out.push(`    net worth incl installments ${snapshot.netWorthInclInstallments}`)
    out.push(`    ${snapshot.disposition}`)
    out.push('')
  }
  if (report.snapshots.length === 0) out.push('  (none)')

  // --- Open discrepancies. ------------------------------------------------
  out.push('')
  out.push('OPEN DISCREPANCIES')
  out.push('-'.repeat(78))
  out.push('')
  if (report.discrepancies.length === 0) {
    out.push('  (none — no FAIL lines against this dump)')
  } else {
    out.push('Each FAIL line, with which side was recorded as correct and why. Resolutions')
    out.push('are read from specs/003-data-foundation/discrepancies.md and never inferred.')
    out.push('The expected value is never edited to match the computed one (FR-010).')
    out.push('')
    for (const discrepancy of report.discrepancies) {
      out.push(`  ${discrepancy.sheetRef}  ${discrepancy.label}`)
      out.push(`    sheet_value      ${discrepancy.sheetValue}`)
      out.push(`    computed_value   ${discrepancy.computedValue}`)
      out.push(`    difference       ${discrepancy.difference}`)
      out.push(`    resolution       ${discrepancy.resolution}${discrepancy.blocking ? '  [BLOCKING]' : ''}`)
      out.push(...wrap(discrepancy.reason, 70).map((l) => `      ${l}`))
      out.push('')
    }
  }

  // --- Coverage. ----------------------------------------------------------
  out.push('')
  out.push('COVERAGE')
  out.push('-'.repeat(78))
  out.push('')
  out.push(
    `  ${report.coverage.formulaCells} of ${report.coverage.declaredFormulas} formula cells accounted for, ` +
      `across ${report.coverage.distinctShapes} distinct formula shapes`,
  )
  out.push(`  ${report.coverage.excludedShapes} shape(s) excluded, each with a reason`)
  if (report.coverage.gaps.length === 0 && report.coverage.strayLines.length === 0) {
    out.push('  no coverage gaps')
  }
  for (const gap of report.coverage.gaps) {
    out.push(`  GAP  ${gap.key} (${gap.count} cells) — ${gap.why}`)
  }
  for (const stray of report.coverage.strayLines) {
    out.push(`  STRAY  ${stray} — the report names a cell the dump does not have`)
  }

  // --- Summary. -----------------------------------------------------------
  out.push('')
  out.push('')
  out.push('SUMMARY')
  out.push('='.repeat(78))
  out.push('')
  // Each verdict is counted separately. Folding CARRIED into PASS would defeat
  // FR-007: a hand-typed cell would print as a calculation the report proved.
  for (const [verdict, count] of Object.entries(report.counts)) {
    out.push(`  ${verdict.padEnd(18)} ${String(count).padStart(4)}`)
  }
  out.push(`  ${'total lines'.padEnd(18)} ${String(report.lines.length).padStart(4)}`)
  out.push('')
  out.push(`  behavioural divergences  ${report.behavioural.length} (not counted above)`)
  out.push(`  unreachable values       ${report.unreachable.length}`)
  out.push(`  snapshots carried over   ${report.snapshots.length} (excluded from pass/fail)`)
  out.push('')
  out.push(
    report.gateOpen
      ? '  COMPLETION GATE: OPEN — no FAIL lines, no coverage gaps, no dropped values.'
      : '  COMPLETION GATE: SHUT — see the blocking entries above.',
  )
  out.push('')

  return out.join('\n')
}

/**
 * `Data!D13` and `Data!D14`: the `Liability`-kind account balances. No SUMIFS
 * on any tab matches the class string `Liability`, so no formula reads either
 * cell (D7).
 */
function unreachableFrom(dump: Dump, state: HouseholdState): UnreachableInput[] {
  const data = dump.sheet('Data')
  const byName = new Map(state.accounts.map((a) => [a.name, a]))
  const inputs: UnreachableInput[] = []

  for (let row = 2; row <= data.maxRow(); row += 1) {
    if (data.stringAt(`B${row}`) !== 'Liability') continue
    const name = data.stringAt(`A${row}`)
    if (name === undefined) continue

    const stored = data.numberAt(`D${row}`) ?? 0
    const account = byName.get(name)
    inputs.push({
      sourceRef: `Data!D${row}`,
      name,
      kind: 'liability',
      storedMinor: Math.round(stored * 100),
      importedMinor: account === undefined ? null : account.quantityMinor,
    })
  }

  return inputs
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current === '') current = word
    else if (current.length + 1 + word.length <= width) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current !== '') lines.push(current)
  return lines
}
