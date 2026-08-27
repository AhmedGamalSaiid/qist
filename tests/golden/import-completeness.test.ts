import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { accounts, cards, incomeSettings, snapshots } from '../../db/schema/index'
import { importFixture, type ImportedFixture } from '../helpers/imported'

/**
 * T047 — regression tests for values an earlier draft silently dropped.
 *
 * Each assertion here marks a real defect that was found and fixed. They are
 * cheap, and the failure mode they guard against is quiet: the import succeeds
 * and the numbers are simply wrong.
 */

describe('import completeness', () => {
  let fixture: ImportedFixture

  beforeAll(async () => {
    fixture = await importFixture()
  })

  afterAll(async () => {
    await fixture.database.dispose()
  })

  it('imports 17 accounts, not 15 — the two Liability rows survive', async () => {
    // An earlier data model constrained `asset_class` to the four asset
    // classes, which would have rejected both rows outright (D7, FR-044).
    const rows = await fixture.database.client.db.select().from(accounts)
    expect(rows).toHaveLength(17)

    const liabilityRows = rows.filter((r) => r.kind === 'liability')
    expect(liabilityRows.map((r) => r.name).sort()).toEqual(['ADIB C.C', 'HSBC C.C'])
    // `Data!D13` holds 600 EGP. It must be imported, even though no formula
    // in the workbook reads it.
    expect(liabilityRows.find((r) => r.name === 'ADIB C.C')?.quantityMinor).toBe(60_000)
    expect(liabilityRows.find((r) => r.name === 'HSBC C.C')?.quantityMinor).toBe(0)
  })

  it('imports 4 cards from the settings block to the right of CC Payments', async () => {
    // Reading only columns A-F of that tab finds nothing and reports "0 rows
    // today — nothing to import", which is what an earlier draft did.
    const rows = await fixture.database.client.db.select().from(cards)
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.name)).toEqual(['ADIB CC', 'HSBC CC', 'CASHBACK CC', 'Valu CC'])
    // No invented defaults: the sheet records no limit or statement day.
    expect(rows.every((r) => r.limitMinor === null)).toBe(true)
    expect(rows.every((r) => r.statementDay === null)).toBe(true)
    expect(rows.every((r) => r.dueDay === null)).toBe(true)
  })

  it('imports the salary as 2250 USD, not 22.50 EGP', async () => {
    // An EGP-only column would have made this a 2,000-fold error in the one
    // figure the household budgets against (FR-047).
    const rows = await fixture.database.client.db.select().from(incomeSettings)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.salaryCurrency).toBe('USD')
    expect(rows[0]?.salaryMinor).toBe(225_000)
    expect(rows[0]?.payDay).toBe(27)
  })

  it('imports exactly one snapshot — History row 2 is a live mirror', async () => {
    // Two snapshots would mean row 2 was imported, persisting a derived value
    // (FR-012). Row 3 is the literal `SNAPSHOTS ↓` separator.
    const rows = await fixture.database.client.db.select().from(snapshots)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.takenOn).toBe('2026-08-17')
    expect(rows[0]?.source).toBe('imported')
    // The including-installments figure was never recorded and cannot be
    // recovered. NULL, and the report must not read it as a zero.
    expect(rows[0]?.netWorthInclInstallmentsMinor).toBeNull()
    expect(rows[0]?.netWorthExclInstallmentsMinor).toBe(23_060_775)
  })

  it('imports every account in stated mode at the sheet exact value', async () => {
    // FR-025. `derived` mode exists, but nothing arrives in it.
    const rows = await fixture.database.client.db.select().from(accounts)
    expect(rows.every((r) => r.balanceMode === 'stated')).toBe(true)
    expect(rows.every((r) => r.quantityMinor !== null)).toBe(true)
    expect(rows.every((r) => r.openingQuantityMinor === null && r.openingDate === null)).toBe(true)
  })
})
