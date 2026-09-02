import { readFileSync } from 'node:fs'
import { calendarDateIn } from '../derive/dates'
import type { IsoDate } from '../money/types'

/**
 * Typed reader over `migration/sheet-dump.json` (T008).
 *
 * **This module does not expose `display`.** The dump carries both a `value`
 * (the spreadsheet's stored number) and a `display` (its formatted string),
 * and the first draft of the derivations contract was built from `display`.
 * It was wrong by 20-40 piastres on every non-zero installment figure, because
 * `display` is rounded for presentation. FR-046 forbids it, and the cheapest
 * way to enforce a rule like that is an API that cannot return the wrong
 * thing — so `display` is dropped at parse time and never reaches a caller.
 */

interface RawCell {
  a1: string
  value?: unknown
  display?: unknown
  type?: string
  formula?: string
}

interface RawSheet {
  meta: {
    name: string
    gid: number
    index: number
    hidden: boolean
    maxRows: number
    maxColumns: number
    usedRange: string
    dumpedRange: string
    truncated: boolean
  }
  formulaCount: number
  cells: RawCell[]
  inputCells?: unknown
  numberFormats?: unknown
  dataValidations?: unknown
  conditionalFormats?: unknown
}

interface RawDump {
  extractedAt: string
  spreadsheet: { id: string; name: string; timeZone: string; locale: string; url: string }
  namedRanges: unknown[]
  sheets: RawSheet[]
}

/** One cell, with `display` structurally absent. */
export interface Cell {
  readonly a1: string
  readonly column: string
  readonly row: number
  readonly value: unknown
  readonly type: string | undefined
  readonly formula: string | undefined
}

const A1 = /^([A-Z]+)(\d+)$/

function splitA1(a1: string): { column: string; row: number } {
  const match = A1.exec(a1)
  if (match === null) throw new TypeError(`Not an A1 reference: ${a1}`)
  return { column: match[1] as string, row: Number(match[2]) }
}

export class SheetView {
  readonly name: string
  readonly index: number
  readonly formulaCount: number
  readonly truncated: boolean
  readonly usedRange: string
  private readonly byA1: Map<string, Cell>
  private readonly cellList: Cell[]

  constructor(raw: RawSheet) {
    this.name = raw.meta.name
    this.index = raw.meta.index
    this.formulaCount = raw.formulaCount
    this.truncated = raw.meta.truncated
    this.usedRange = raw.meta.usedRange
    this.byA1 = new Map()
    this.cellList = []

    for (const rawCell of raw.cells) {
      const { column, row } = splitA1(rawCell.a1)
      // `display` is deliberately not carried over. See the module comment.
      const cell: Cell = {
        a1: rawCell.a1,
        column,
        row,
        value: rawCell.value,
        type: rawCell.type,
        formula: rawCell.formula,
      }
      this.byA1.set(rawCell.a1, cell)
      this.cellList.push(cell)
    }
  }

  /** Every cell the dump carries, in dump order. */
  cells(): readonly Cell[] {
    return this.cellList
  }

  /** Every cell that carries a formula, in dump order. */
  formulaCells(): readonly Cell[] {
    return this.cellList.filter((c) => c.formula !== undefined)
  }

  cell(a1: string): Cell | undefined {
    return this.byA1.get(a1)
  }

  /** The stored value at `a1`, or `undefined` if the cell is blank or absent. */
  valueAt(a1: string): unknown {
    return this.byA1.get(a1)?.value
  }

  /**
   * The stored number at `a1`. This is the money path: it reads `value`, and
   * there is no variant of it that reads `display`.
   */
  numberAt(a1: string): number | undefined {
    const value = this.valueAt(a1)
    if (typeof value !== 'number') return undefined
    return value
  }

  /** The stored number at `a1`, or a hard failure — for cells that must exist. */
  requireNumberAt(a1: string): number {
    const value = this.numberAt(a1)
    if (value === undefined) {
      throw new TypeError(`${this.name}!${a1} does not hold a number in the dump`)
    }
    return value
  }

  stringAt(a1: string): string | undefined {
    const value = this.valueAt(a1)
    if (typeof value !== 'string') return undefined
    return value
  }

  booleanAt(a1: string): boolean | undefined {
    const value = this.valueAt(a1)
    if (typeof value !== 'boolean') return undefined
    return value
  }

  /**
   * The calendar date at `a1`, read in the spreadsheet's own timezone.
   *
   * The dump stores dates as instants — `2026-09-15T07:00:00.000Z` is midnight
   * on 15 September in `America/Los_Angeles`. Reading that as UTC gives the
   * right date by luck; reading `2026-08-24T21:00:00.000Z` (the sole
   * transaction) as UTC gives 24 August, and reading it in Cairo gives the
   * 25th. The sheet means whatever its own zone says, so that is what this
   * returns.
   */
  dateAt(a1: string, sourceTimeZone: string): IsoDate | undefined {
    const value = this.valueAt(a1)
    if (typeof value !== 'string') return undefined
    const instant = new Date(value)
    if (Number.isNaN(instant.getTime())) return undefined
    return calendarDateIn(instant, sourceTimeZone)
  }

  /** The highest row number the dump carries for this sheet. */
  maxRow(): number {
    return this.cellList.reduce((max, c) => (c.row > max ? c.row : max), 0)
  }
}

export class Dump {
  readonly extractedAt: string
  readonly spreadsheetId: string
  readonly spreadsheetName: string
  /** The spreadsheet's own timezone, as recorded at extraction. */
  readonly sourceTimeZone: string
  readonly locale: string
  private readonly byName: Map<string, SheetView>
  private readonly byIndex: Map<number, SheetView>
  private readonly order: SheetView[]

  constructor(raw: RawDump) {
    this.extractedAt = raw.extractedAt
    this.spreadsheetId = raw.spreadsheet.id
    this.spreadsheetName = raw.spreadsheet.name
    this.sourceTimeZone = raw.spreadsheet.timeZone
    this.locale = raw.spreadsheet.locale
    this.byName = new Map()
    this.byIndex = new Map()
    this.order = []

    for (const rawSheet of raw.sheets) {
      const view = new SheetView(rawSheet)
      this.byName.set(view.name, view)
      this.byIndex.set(view.index, view)
      this.order.push(view)
    }
  }

  static fromFile(path: string): Dump {
    const text = readFileSync(path, 'utf8')
    return new Dump(JSON.parse(text) as RawDump)
  }

  /** Sheets in workbook order. */
  sheets(): readonly SheetView[] {
    return this.order
  }

  sheet(name: string): SheetView {
    const sheet = this.byName.get(name)
    if (sheet === undefined) {
      throw new TypeError(
        `The dump has no sheet named ${JSON.stringify(name)}. Present: ${[...this.byName.keys()].join(', ')}`,
      )
    }
    return sheet
  }

  /** Sheets are indexed from 1, matching the workbook's own numbering. */
  sheetByIndex(index: number): SheetView {
    const sheet = this.byIndex.get(index)
    if (sheet === undefined) {
      throw new TypeError(`The dump has no sheet at index ${index}`)
    }
    return sheet
  }

  has(name: string): boolean {
    return this.byName.has(name)
  }

  /**
   * The dump's own formula total, counted from the dump rather than copied
   * from any document. `coverage:check` compares the matrix against this.
   */
  formulaTotal(): number {
    return this.order.reduce((sum, sheet) => sum + sheet.formulaCount, 0)
  }

  /** Formula cells actually present, which must agree with `formulaTotal()`. */
  countFormulaCells(): number {
    return this.order.reduce((sum, sheet) => sum + sheet.formulaCells().length, 0)
  }
}

export const DEFAULT_DUMP_PATH = 'migration/sheet-dump.json'
