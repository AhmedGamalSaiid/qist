import { IncompleteDumpError } from '../errors'
import type { Dump } from './dump'

/**
 * Dump completeness check (FR-002, T010).
 *
 * Refuses a truncated or incomplete dump and states exactly what was missing.
 * The failure mode this prevents is quiet: a dump truncated at row 40 of
 * `Installments` imports cleanly, reconciles against its own truncated
 * figures, and reports a net worth several million EGP wrong.
 */

/** Sheets the model cannot be recovered without, with the range each must reach. */
const REQUIRED_SHEETS: ReadonlyArray<{ name: string; minRow: number; why: string }> = [
  { name: 'Dashboard', minRow: 22, why: 'the 21-year unpaid-installment spine ends at I22' },
  { name: 'CC Payments', minRow: 10, why: 'the cards block runs H7:H10' },
  { name: 'Data', minRow: 18, why: 'accounts run A2:E18' },
  { name: 'Total', minRow: 10, why: 'the short-term liability list runs I4:J10' },
  { name: 'Installments', minRow: 57, why: 'the 56 installments run A2:E57' },
  { name: 'Investment', minRow: 2, why: 'the investment totals are on row 2' },
  { name: 'Rates', minRow: 4, why: 'three rates run A2:C4' },
  { name: 'Net Worth', minRow: 20, why: 'the net-worth figures run B12:B20' },
  { name: 'Transactions', minRow: 25, why: 'the 24-month rollup spine runs J2:N25' },
  { name: 'History', minRow: 4, why: 'the sole genuine snapshot is row 4' },
]

/** Cells whose absence would silently change a figure rather than fail loudly. */
const REQUIRED_CELLS: ReadonlyArray<{ sheet: string; a1: string; why: string }> = [
  { sheet: 'Rates', a1: 'B2', why: 'the USD/EGP rate' },
  { sheet: 'Rates', a1: 'B3', why: 'the gold rate' },
  { sheet: 'Rates', a1: 'B4', why: 'the silver rate' },
  { sheet: 'Rates', a1: 'C2', why: 'the rate as-of date' },
  { sheet: 'CC Payments', a1: 'I2', why: 'the salary amount' },
  { sheet: 'CC Payments', a1: 'I3', why: 'the salary currency' },
  { sheet: 'CC Payments', a1: 'I4', why: 'the salary pay day' },
  { sheet: 'History', a1: 'A4', why: 'the snapshot date' },
  { sheet: 'History', a1: 'G4', why: 'the snapshot net worth excluding installments' },
]

export function validateDump(dump: Dump): void {
  const missing: string[] = []

  for (const required of REQUIRED_SHEETS) {
    if (!dump.has(required.name)) {
      missing.push(`sheet "${required.name}" is absent entirely`)
      continue
    }
    const sheet = dump.sheet(required.name)
    if (sheet.truncated) {
      missing.push(
        `sheet "${required.name}" is marked truncated (dumped ${sheet.usedRange}) — ${required.why}`,
      )
    }
    const maxRow = sheet.maxRow()
    if (maxRow < required.minRow) {
      missing.push(
        `sheet "${required.name}" stops at row ${maxRow}, but ${required.why} (needs row ${required.minRow})`,
      )
    }
  }

  for (const required of REQUIRED_CELLS) {
    if (!dump.has(required.sheet)) continue // already reported above
    const cell = dump.sheet(required.sheet).cell(required.a1)
    if (cell === undefined || cell.value === undefined) {
      missing.push(`${required.sheet}!${required.a1} is blank — ${required.why}`)
    }
  }

  const declared = dump.formulaTotal()
  const present = dump.countFormulaCells()
  if (declared !== present) {
    missing.push(
      `the dump declares ${declared} formulas but carries ${present} formula cells — ` +
        `the extraction did not finish`,
    )
  }

  if (missing.length > 0) throw new IncompleteDumpError(missing)
}
