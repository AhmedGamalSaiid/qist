import type { Dump } from '../import/dump'
import { columnToIndex, indexToColumn, normaliseFormula } from '../import/normalise'
import { ownershipFor, UNASSIGNED } from './ownership'

/**
 * The coverage matrix (T012).
 *
 * `"707 formulas reduce to ~25 computations"` was a claim this feature had
 * asserted in prose without demonstrating anywhere. It cannot be checked by
 * reading, and task decomposition cannot work against it: nothing said which
 * cells a given derivation was responsible for, so a formula-bearing range
 * could be missed with no test failing.
 *
 * This module derives the matrix from the dump. It is what turns the
 * computation count into a measured number.
 */

/** Where the generated matrix is committed. */
export const COVERAGE_PATH = 'specs/003-data-foundation/contracts/coverage.md'

export interface CoverageRow {
  readonly sheet: string
  readonly range: string
  readonly key: string
  readonly count: number
  readonly shape: string
  readonly owner: string
  readonly reason: string
  readonly verdict: string
  readonly cells: readonly string[]
}

export function buildCoverageMatrix(dump: Dump): CoverageRow[] {
  const rows: CoverageRow[] = []

  for (const sheet of dump.sheets()) {
    // Insertion order is dump order, which is the sheet's own reading order.
    const groups = new Map<string, string[]>()
    for (const cell of sheet.formulaCells()) {
      const shape = normaliseFormula(cell.formula as string, cell.a1)
      const list = groups.get(shape) ?? []
      list.push(cell.a1)
      groups.set(shape, list)
    }

    for (const [shape, cells] of groups) {
      const range = boundingRange(cells)
      const key = `${sheet.name}!${range}`
      const ownership = ownershipFor(key)
      rows.push({
        sheet: sheet.name,
        range,
        key,
        count: cells.length,
        shape,
        owner: ownership.owner,
        reason: ownership.reason ?? '—',
        verdict: ownership.verdict,
        cells,
      })
    }
  }

  return rows
}

export interface CoverageSummary {
  readonly rows: CoverageRow[]
  readonly formulaCells: number
  readonly declaredFormulas: number
  readonly distinctShapes: number
  readonly excluded: number
  readonly unassigned: CoverageRow[]
  readonly missingReason: CoverageRow[]
  readonly complete: boolean
}

export function summariseCoverage(dump: Dump, rows: CoverageRow[]): CoverageSummary {
  const formulaCells = rows.reduce((sum, row) => sum + row.count, 0)
  const declaredFormulas = dump.formulaTotal()
  const unassigned = rows.filter((row) => row.owner === UNASSIGNED)
  const missingReason = rows.filter((row) => row.owner === 'EXCLUDED' && row.reason === '—')

  return {
    rows,
    formulaCells,
    declaredFormulas,
    distinctShapes: rows.length,
    excluded: rows.filter((row) => row.owner === 'EXCLUDED').length,
    unassigned,
    missingReason,
    // The matrix is complete when `sum(count)` equals the dump's own formula
    // total, counted from the dump rather than copied from any document.
    complete:
      formulaCells === declaredFormulas &&
      unassigned.length === 0 &&
      missingReason.length === 0,
  }
}

/** Every cell the matrix accounts for, as `Sheet!A1`. */
export function coveredCells(rows: readonly CoverageRow[]): Set<string> {
  const out = new Set<string>()
  for (const row of rows) {
    for (const cell of row.cells) out.add(`${row.sheet}!${cell}`)
  }
  return out
}

function boundingRange(cells: readonly string[]): string {
  let minC = Number.POSITIVE_INFINITY
  let maxC = Number.NEGATIVE_INFINITY
  let minR = Number.POSITIVE_INFINITY
  let maxR = Number.NEGATIVE_INFINITY

  for (const a1 of cells) {
    const match = /^([A-Z]+)(\d+)$/.exec(a1)
    if (match === null) throw new TypeError(`Not an A1 reference: ${a1}`)
    const column = columnToIndex(match[1] as string)
    const row = Number(match[2])
    if (column < minC) minC = column
    if (column > maxC) maxC = column
    if (row < minR) minR = row
    if (row > maxR) maxR = row
  }

  const start = `${indexToColumn(minC)}${minR}`
  const end = `${indexToColumn(maxC)}${maxR}`
  return start === end ? start : `${start}:${end}`
}

/** The matrix rendered as `contracts/coverage.md`. */
export function renderCoverageMatrix(dump: Dump, summary: CoverageSummary): string {
  const lines: string[] = []

  lines.push('# Coverage matrix')
  lines.push('')
  lines.push('**GENERATED** by `npm run coverage:generate` — do not edit by hand.')
  lines.push('`npm run coverage:check` regenerates this file and fails on any difference,')
  lines.push('so a hand edit is reported as drift. Owner assignments live in')
  lines.push('[`lib/reconcile/ownership.ts`](../../../lib/reconcile/ownership.ts).')
  lines.push('')
  lines.push(`Source dump: \`migration/sheet-dump.json\`, extracted ${dump.extractedAt}.`)
  lines.push('')
  lines.push('## Measured totals')
  lines.push('')
  lines.push('| Measure | Value |')
  lines.push('|---|---|')
  lines.push(`| Formula cells in the dump | ${summary.declaredFormulas} |`)
  lines.push(`| Formula cells accounted for | ${summary.formulaCells} |`)
  lines.push(`| Distinct formula shapes | ${summary.distinctShapes} |`)
  lines.push(`| Shapes excluded with a reason | ${summary.excluded} |`)
  lines.push(`| Shapes owned by a derivation | ${summary.distinctShapes - summary.excluded} |`)
  lines.push('')
  lines.push(
    'The `shape` column is the formula in R1C1 form, relative to the cell that holds it.',
  )
  lines.push('Two cells share a shape when one is a fill of the other, which is how 707')
  lines.push('formula cells collapse to a countable number of computations.')
  lines.push('')
  lines.push('## Matrix')
  lines.push('')
  lines.push('| range | count | shape | owner | reason | verdict |')
  lines.push('|---|---:|---|---|---|---|')

  for (const row of summary.rows) {
    lines.push(
      `| \`${row.key}\` | ${row.count} | \`${escapePipes(row.shape)}\` | ${row.owner} | ${escapePipes(row.reason)} | ${row.verdict} |`,
    )
  }

  lines.push('')
  return lines.join('\n')
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, '\\|')
}
