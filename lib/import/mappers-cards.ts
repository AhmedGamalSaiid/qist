import { toMinor } from '../money/round'
import type { MinorUnits } from '../money/types'
import type { Dump } from './dump'
import { derivedId } from './ids'

/**
 * `CC Payments` (T057).
 *
 * **This tab is not empty.** An earlier draft of the data model recorded it as
 * "0 rows today — nothing to import". That is true only of the *payment rows*:
 * `A2:F10` are blank, but the tab also carries a settings block to the right
 * holding real, in-use configuration — a salary, its currency, a pay day, and
 * four cards. Reading only columns A-F discards all of it, and with it the
 * whole of the feature-002 setup.
 */

export interface MappedCard {
  id: string
  householdId: string
  name: string
  limitMinor: null
  statementDay: null
  dueDay: null
  sortOrder: number
  createdAt: number
}

/** `CC Payments!H7:H10` -> 4 cards. */
export function mapCards(dump: Dump, householdId: string, createdAt: number): MappedCard[] {
  const sheet = dump.sheet('CC Payments')
  const out: MappedCard[] = []

  for (let row = 7; row <= 10; row += 1) {
    const name = sheet.stringAt(`H${row}`)
    if (name === undefined || name.trim() === '') continue
    out.push({
      id: derivedId(householdId, 'cards', `H${row}`),
      householdId,
      name,
      // The sheet records no limit, statement day or due day. These import as
      // NULL rather than as invented defaults — a fabricated `statement_day`
      // would be a derived value masquerading as a fact.
      limitMinor: null,
      statementDay: null,
      dueDay: null,
      sortOrder: row,
      createdAt,
    })
  }

  return out
}

export interface MappedIncomeSettings {
  householdId: string
  salaryMinor: MinorUnits | null
  salaryCurrency: 'EGP' | 'USD'
  payDay: number | null
  createdAt: number
  updatedAt: number
}

/**
 * `CC Payments!I2:I4` -> one `income_settings` row.
 *
 * **The salary is 2250 USD, not EGP.** An earlier draft typed `salary_minor`
 * as EGP piastres outright, which would have imported it as 22.50 EGP — a
 * 2,000-fold error in the one figure the household budgets against. An amount
 * is meaningless without its currency (FR-047), so the currency is read from
 * the sheet rather than assumed.
 */
export function mapIncomeSettings(
  dump: Dump,
  householdId: string,
  createdAt: number,
): MappedIncomeSettings {
  const sheet = dump.sheet('CC Payments')

  const rawCurrency = sheet.stringAt('I3')
  if (rawCurrency !== 'EGP' && rawCurrency !== 'USD') {
    throw new TypeError(
      `CC Payments!I3 holds ${JSON.stringify(rawCurrency)}, which is not a currency this system stores. ` +
        `Refusing to guess: a salary imported under the wrong currency is a silent 50-fold error.`,
    )
  }

  const salary = sheet.numberAt('I2')
  const payDay = sheet.numberAt('I4')

  return {
    householdId,
    salaryMinor: salary === undefined ? null : toMinor(salary, rawCurrency),
    salaryCurrency: rawCurrency,
    payDay: payDay === undefined ? null : payDay,
    createdAt,
    updatedAt: createdAt,
  }
}
