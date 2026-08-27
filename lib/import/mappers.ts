import { toMinor, toMinorAtScale } from '../money/round'
import type { AssetClass, IsoDate, MinorUnits } from '../money/types'
import { RATE_SCALE } from '../money/types'
import type { Dump } from './dump'
import { derivedId } from './ids'

/**
 * Entity mappers (T056).
 *
 * Every value here is read from the dump's `value` field. `display` is not
 * reachable from `SheetView` at all, which is the point (FR-046).
 */

export interface MappedAccount {
  id: string
  householdId: string
  name: string
  kind: 'asset' | 'liability'
  assetClass: AssetClass
  isInvestment: number
  balanceMode: 'stated'
  quantityMinor: MinorUnits
  openingQuantityMinor: null
  openingDate: null
  asOf: IsoDate | null
  sortOrder: number
  archivedAt: null
  createdAt: number
}

/**
 * The `Data` tab's class column is a dropdown whose permitted values are
 * `USD`, `EGP`, `Gold`, `Silver` and `Liability`. The first four are asset
 * classes; `Liability` is a *kind*, and mapping it into `asset_class` would
 * either need a fifth class the totals must then remember to skip, or would
 * drop the two rows that use it.
 */
function classifyAccount(sheetClass: string): { kind: 'asset' | 'liability'; assetClass: AssetClass } {
  switch (sheetClass) {
    case 'USD':
      return { kind: 'asset', assetClass: 'USD' }
    case 'EGP':
      return { kind: 'asset', assetClass: 'EGP' }
    case 'Gold':
      return { kind: 'asset', assetClass: 'GOLD' }
    case 'Silver':
      return { kind: 'asset', assetClass: 'SILVER' }
    case 'Liability':
      // These are EGP-denominated card balances. The class is what they are
      // measured in; `kind` is what they are.
      return { kind: 'liability', assetClass: 'EGP' }
    default:
      throw new TypeError(
        `Data!B holds an unrecognised class ${JSON.stringify(sheetClass)}. ` +
          `The sheet's dropdown permits USD, EGP, Gold, Silver, Liability.`,
      )
  }
}

/** `Data!A:E` -> accounts. 17 rows: 15 asset, 2 liability. */
export function mapAccounts(dump: Dump, householdId: string, createdAt: number): MappedAccount[] {
  const sheet = dump.sheet('Data')
  const out: MappedAccount[] = []

  for (let row = 2; row <= sheet.maxRow(); row += 1) {
    const name = sheet.stringAt(`A${row}`)
    if (name === undefined || name.trim() === '') continue

    const sheetClass = sheet.stringAt(`B${row}`)
    if (sheetClass === undefined) {
      throw new TypeError(`Data!A${row} names an account but Data!B${row} has no class`)
    }
    const { kind, assetClass } = classifyAccount(sheetClass)
    const amount = sheet.numberAt(`D${row}`) ?? 0

    out.push({
      // The sheet has no identifier of its own, so the row number is the
      // natural key. See lib/import/ids.ts on why that is load-bearing.
      id: derivedId(householdId, 'accounts', String(row)),
      householdId,
      name,
      kind,
      assetClass,
      isInvestment: sheet.booleanAt(`C${row}`) === true ? 1 : 0,
      balanceMode: 'stated',
      quantityMinor: toMinor(amount, assetClass),
      openingQuantityMinor: null,
      openingDate: null,
      asOf: sheet.dateAt(`E${row}`, dump.sourceTimeZone) ?? null,
      sortOrder: row,
      archivedAt: null,
      createdAt,
    })
  }

  return out
}

export interface MappedPropertyHolding {
  id: string
  householdId: string
  name: string
  paidToDateMinor: MinorUnits
  sortOrder: number
  createdAt: number
}

/** `Net Worth!B9:B11` -> property holdings. Assets, not liabilities. */
export function mapPropertyHoldings(
  dump: Dump,
  householdId: string,
  createdAt: number,
): MappedPropertyHolding[] {
  const sheet = dump.sheet('Net Worth')
  const out: MappedPropertyHolding[] = []

  for (let row = 9; row <= 11; row += 1) {
    const name = sheet.stringAt(`A${row}`)
    if (name === undefined) continue
    out.push({
      id: derivedId(householdId, 'property_holdings', `B${row}`),
      householdId,
      name,
      paidToDateMinor: toMinor(sheet.numberAt(`B${row}`) ?? 0, 'EGP'),
      sortOrder: row,
      createdAt,
    })
  }

  return out
}

export interface MappedLiability {
  id: string
  householdId: string
  name: string
  amountMinor: MinorUnits
  sortOrder: number
  createdAt: number
}

/** `Total!I4:J10` -> short-term liabilities. 7 rows, one of them Arabic. */
export function mapLiabilities(
  dump: Dump,
  householdId: string,
  createdAt: number,
): MappedLiability[] {
  const sheet = dump.sheet('Total')
  const out: MappedLiability[] = []

  for (let row = 4; row <= 10; row += 1) {
    const name = sheet.stringAt(`I${row}`)
    if (name === undefined) continue
    out.push({
      id: derivedId(householdId, 'liabilities', String(row)),
      householdId,
      // `فرش` at Total!J9 must survive byte-exact (FR-004). Nothing here
      // normalises, trims or re-encodes it.
      name,
      amountMinor: toMinor(sheet.numberAt(`J${row}`) ?? 0, 'EGP'),
      sortOrder: row,
      createdAt,
    })
  }

  return out
}

export interface MappedInstallment {
  id: string
  householdId: string
  planName: string
  dueOn: IsoDate
  amountMinor: MinorUnits
  kind: string | null
  paidAt: number | null
  paidBy: null
  sortOrder: number
  createdAt: number
}

/**
 * `Installments!A:E` -> installments (56 rows).
 *
 * The sheet's `"Yes"`/`"No"` becomes a nullable `paid_at` timestamp. The sheet
 * does not record *when* a payment happened, so a paid row imports with the
 * import timestamp and unpaid rows import NULL; NULL is what every derivation
 * actually tests.
 */
export function mapInstallments(
  dump: Dump,
  householdId: string,
  createdAt: number,
): MappedInstallment[] {
  const sheet = dump.sheet('Installments')
  const out: MappedInstallment[] = []

  for (let row = 2; row <= sheet.maxRow(); row += 1) {
    const planName = sheet.stringAt(`A${row}`)
    if (planName === undefined || planName.trim() === '') continue

    const dueOn = sheet.dateAt(`B${row}`, dump.sourceTimeZone)
    if (dueOn === undefined) {
      throw new TypeError(`Installments!B${row} is not a date`)
    }

    const paid = sheet.stringAt(`E${row}`) === 'Yes'
    out.push({
      id: derivedId(householdId, 'installments', String(row)),
      householdId,
      planName,
      dueOn,
      amountMinor: toMinor(sheet.numberAt(`C${row}`) ?? 0, 'EGP'),
      kind: sheet.stringAt(`D${row}`) ?? null,
      paidAt: paid ? createdAt : null,
      paidBy: null,
      sortOrder: row,
      createdAt,
    })
  }

  return out
}

export interface MappedRate {
  id: string
  householdId: string
  assetClass: 'USD' | 'GOLD' | 'SILVER'
  rateMinor: MinorUnits
  scale: number
  asOf: IsoDate
  source: 'imported'
  createdBy: null
  createdAt: number
}

/** `Rates!A:C` -> three dated rate records. */
export function mapRates(dump: Dump, householdId: string, createdAt: number): MappedRate[] {
  const sheet = dump.sheet('Rates')
  const rows: Array<{ row: number; assetClass: 'USD' | 'GOLD' | 'SILVER' }> = [
    { row: 2, assetClass: 'USD' },
    { row: 3, assetClass: 'GOLD' },
    { row: 4, assetClass: 'SILVER' },
  ]

  return rows.map(({ row, assetClass }) => {
    const value = sheet.numberAt(`B${row}`)
    if (value === undefined) throw new TypeError(`Rates!B${row} holds no rate`)
    const asOf = sheet.dateAt(`C${row}`, dump.sourceTimeZone)
    if (asOf === undefined) throw new TypeError(`Rates!C${row} holds no date`)

    const scale = RATE_SCALE[assetClass]
    return {
      // `asset_class + as_of` is the natural key, matching the table's own
      // UNIQUE(household_id, asset_class, as_of).
      id: derivedId(householdId, 'rates', `${assetClass}|${asOf}`),
      householdId,
      assetClass,
      rateMinor: toMinorAtScale(value, scale),
      scale,
      asOf,
      // `imported`, not `manual`: nobody typed this into the app, and not
      // `fetch` either, even though Rates!B2 came from GOOGLEFINANCE — the
      // fetch happened in the spreadsheet, not here.
      source: 'imported',
      createdBy: null,
      createdAt,
    }
  })
}

export interface MappedTransaction {
  id: string
  householdId: string
  occurredOn: IsoDate
  kind: 'income' | 'expense' | 'transfer'
  category: string | null
  accountId: string | null
  amountMinor: MinorUnits
  currency: 'EGP' | 'USD'
  rateId: string | null
  note: string | null
  reversesId: null
  createdBy: string
  createdAt: number
}

/** `Transactions!A:H` -> transactions (1 row today). */
export function mapTransactions(
  dump: Dump,
  householdId: string,
  createdAt: number,
  context: {
    createdBy: string
    accountIdByName: ReadonlyMap<string, string>
    rateIdFor: (assetClass: 'USD', onDate: IsoDate) => string
  },
): MappedTransaction[] {
  const sheet = dump.sheet('Transactions')
  const out: MappedTransaction[] = []

  for (let row = 2; row <= sheet.maxRow(); row += 1) {
    const occurredOn = sheet.dateAt(`A${row}`, dump.sourceTimeZone)
    if (occurredOn === undefined) continue

    const rawKind = (sheet.stringAt(`B${row}`) ?? '').toLowerCase()
    if (rawKind !== 'income' && rawKind !== 'expense' && rawKind !== 'transfer') {
      throw new TypeError(`Transactions!B${row} holds an unrecognised type ${JSON.stringify(rawKind)}`)
    }

    const currency = sheet.stringAt(`F${row}`) === 'USD' ? 'USD' : 'EGP'
    const accountName = sheet.stringAt(`D${row}`)

    out.push({
      id: derivedId(householdId, 'transactions', String(row)),
      householdId,
      occurredOn,
      kind: rawKind,
      category: sheet.stringAt(`C${row}`) ?? null,
      accountId: accountName === undefined ? null : (context.accountIdByName.get(accountName) ?? null),
      amountMinor: toMinor(sheet.numberAt(`E${row}`) ?? 0, currency),
      currency,
      // The rate is pinned at the transaction's own date (R4, FR-042). Storing
      // the converted result instead would violate FR-012 and hide which rate
      // produced it.
      rateId: currency === 'USD' ? context.rateIdFor('USD', occurredOn) : null,
      note: sheet.stringAt(`H${row}`) ?? null,
      reversesId: null,
      createdBy: context.createdBy,
      createdAt,
    })
  }

  return out
}
