import { readFileSync } from 'node:fs'
import type { ReportLine } from './verdict'

/**
 * Open discrepancies and their resolution record (T064a, FR-010, FR-009).
 *
 * Every `FAIL` line gets an entry carrying the sheet value, the computed
 * value, and a `resolution` recording **which side was correct and why**.
 *
 * Resolutions are read from a committed file, never inferred. The expected
 * value is **never** editable to match the computed one: a resolution of
 * `computed-correct` reclassifies the line as a divergence and requires a
 * written reason, and an `unresolved` entry keeps the line a `FAIL` and the
 * completion gate shut.
 *
 * That asymmetry is the point. Without it, the cheapest way to make a red
 * report green is to change the number it was checking against, which would
 * turn the whole parity proof into a tautology.
 */

export const DISCREPANCIES_PATH = 'specs/003-data-foundation/discrepancies.md'

export type Resolution = 'sheet-correct' | 'computed-correct' | 'unresolved'

export interface DiscrepancyRecord {
  readonly sheetRef: string
  readonly resolution: Resolution
  readonly reason: string
}

export interface OpenDiscrepancy {
  readonly sheetRef: string
  readonly label: string
  readonly sheetValue: number | string | null
  readonly computedValue: number | string | null
  readonly difference: number | string
  readonly resolution: Resolution
  readonly reason: string
  /** True while this entry blocks completion (FR-009). */
  readonly blocking: boolean
}

/**
 * Parse the committed register. Rows look like:
 *
 *     | `Net Worth!B12` | computed-correct | the sheet double-counts property |
 */
export function parseDiscrepancies(markdown: string): DiscrepancyRecord[] {
  const records: DiscrepancyRecord[] = []

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim()
    if (!line.startsWith('|')) continue

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/^`|`$/g, ''))
    if (cells.length < 3) continue

    const [sheetRef, resolution, reason] = cells as [string, string, string]
    if (sheetRef === '' || sheetRef.toLowerCase() === 'sheet_ref') continue
    if (/^-+$/.test(sheetRef)) continue
    if (!isResolution(resolution)) continue

    records.push({ sheetRef, resolution, reason })
  }

  return records
}

export function loadDiscrepancies(path = DISCREPANCIES_PATH): DiscrepancyRecord[] {
  try {
    return parseDiscrepancies(readFileSync(path, 'utf8'))
  } catch {
    // An absent register is not an error — it is the normal state of a clean
    // report. What is an error is a FAIL with no entry, which is caught below.
    return []
  }
}

export function buildOpenDiscrepancies(
  lines: readonly ReportLine[],
  records: readonly DiscrepancyRecord[],
): OpenDiscrepancy[] {
  const byRef = new Map(records.map((record) => [record.sheetRef, record]))

  return lines
    .filter((line) => line.verdict === 'FAIL')
    .map((line) => {
      const record = byRef.get(line.sheetRef)
      const resolution: Resolution = record?.resolution ?? 'unresolved'
      const reason =
        record?.reason ??
        'No entry in the discrepancy register. Record which side is correct and why.'

      return {
        sheetRef: line.sheetRef,
        label: line.label,
        sheetValue: line.sheetValue,
        computedValue: line.computedValue,
        difference: line.difference,
        resolution,
        reason,
        // `sheet-correct` means the port is wrong and must be fixed, so it
        // stays blocking. `computed-correct` means the sheet was quietly wrong
        // and the line is reclassified as a divergence with a written reason.
        blocking: resolution !== 'computed-correct',
      }
    })
}

function isResolution(value: string): value is Resolution {
  return value === 'sheet-correct' || value === 'computed-correct' || value === 'unresolved'
}
