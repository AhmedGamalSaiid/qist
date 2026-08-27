import type { Dump } from '../import/dump'
import { buildCoverageMatrix, summariseCoverage, type CoverageRow } from './coverage-matrix'
import { columnToIndex } from '../import/normalise'
import type { ReportLine } from './verdict'

/**
 * Coverage enforcement (T065).
 *
 * Every formula-bearing cell in the matrix must appear on the report or be
 * explicitly excluded with a reason. **A coverage gap is a `FAIL` of the
 * report itself** — a figure the report does not mention is one nothing
 * checked, and the report would look clean while proving less than it claims.
 */

export interface CoverageGap {
  readonly key: string
  readonly count: number
  readonly owner: string
  readonly why: string
}

export interface CoverageEnforcement {
  readonly formulaCells: number
  readonly declaredFormulas: number
  readonly distinctShapes: number
  readonly excludedShapes: number
  readonly gaps: CoverageGap[]
  readonly strayLines: string[]
  readonly clean: boolean
}

export function enforceCoverage(dump: Dump, lines: readonly ReportLine[]): CoverageEnforcement {
  const rows = buildCoverageMatrix(dump)
  const summary = summariseCoverage(dump, rows)
  const reported = new Set(lines.map((line) => line.sheetRef))

  const gaps: CoverageGap[] = []

  for (const row of rows) {
    if (row.owner === 'EXCLUDED') {
      if (row.reason === '—') {
        gaps.push({
          key: row.key,
          count: row.count,
          owner: row.owner,
          why: 'excluded from the report with no reason given',
        })
      }
      continue
    }
    if (row.owner === 'UNASSIGNED') {
      gaps.push({
        key: row.key,
        count: row.count,
        owner: row.owner,
        why: 'no derivation owns this range, so nothing computes or tests it',
      })
      continue
    }
    // A range is covered when at least one report line falls inside it. A
    // 499-cell range where 498 cells are empty needs one line, not 499.
    const covered = row.cells.some((cell) => reported.has(`${row.sheet}!${cell}`))
    if (!covered) {
      gaps.push({
        key: row.key,
        count: row.count,
        owner: row.owner,
        why: `owned by ${row.owner} but no report line falls inside the range`,
      })
    }
  }

  // A line pointing at a cell the dump has no formula for is not an error —
  // hand-typed inputs are reported as CARRIED — but a line pointing at a cell
  // that does not exist at all is a bug in the reporter.
  const strayLines: string[] = []
  for (const line of lines) {
    const [sheetName, a1] = splitRef(line.sheetRef)
    if (sheetName === null || a1 === null) {
      strayLines.push(line.sheetRef)
      continue
    }
    if (!dump.has(sheetName)) {
      strayLines.push(line.sheetRef)
      continue
    }
    if (dump.sheet(sheetName).cell(a1) === undefined) {
      strayLines.push(line.sheetRef)
    }
  }

  return {
    formulaCells: summary.formulaCells,
    declaredFormulas: summary.declaredFormulas,
    distinctShapes: summary.distinctShapes,
    excludedShapes: summary.excluded,
    gaps,
    strayLines,
    clean: gaps.length === 0 && strayLines.length === 0 && summary.complete,
  }
}

/** Ranges excluded from the report, with the reason each carries. */
export function excludedRanges(dump: Dump): CoverageRow[] {
  return buildCoverageMatrix(dump).filter((row) => row.owner === 'EXCLUDED')
}

function splitRef(sheetRef: string): [string | null, string | null] {
  const index = sheetRef.lastIndexOf('!')
  if (index === -1) return [null, null]
  const sheetName = sheetRef.slice(0, index)
  const a1 = sheetRef.slice(index + 1)
  if (!/^[A-Z]+\d+$/.test(a1)) return [sheetName, null]
  // Validate the column parses, so a malformed ref is caught rather than
  // silently treated as absent.
  columnToIndex(/^([A-Z]+)/.exec(a1)?.[1] ?? '')
  return [sheetName, a1]
}
