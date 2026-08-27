import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { rates } from '../../db/schema/index'
import { recordRate } from '../../lib/rates/record'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'

/**
 * T082 — recording a rate inserts and never updates (FR-038).
 *
 * The `UNIQUE(household_id, asset_class, as_of)` constraint is what makes
 * "append-only" a property of the database rather than of the code that
 * happens to write to it today.
 */

const HOUSEHOLD = 'H1AAAAAAAAAAAAAAAAAAAAAAAA'
const USER = 'U1AAAAAAAAAAAAAAAAAAAAAAAA'

describe('rates are append-only', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('inserts rather than updating when a new rate arrives', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    await recordRate(client, ctx, {
      id: 'RATEA000000000000000000001',
      assetClass: 'USD',
      rateMinor: 500_000,
      asOf: '2026-08-01',
      source: 'manual',
      at: 1,
      auditId: 'AUDRA00000000000000000001A',
    })
    await recordRate(client, ctx, {
      id: 'RATEB000000000000000000001',
      assetClass: 'USD',
      rateMinor: 502_554,
      asOf: '2026-08-17',
      source: 'manual',
      at: 2,
      auditId: 'AUDRB00000000000000000001A',
    })

    const rows = await client.db.select().from(rates)
    expect(rows).toHaveLength(2)
    // The older rate is untouched. Nothing overwrote it.
    expect(rows.find((r) => r.id === 'RATEA000000000000000000001')?.rateMinor).toBe(500_000)
  })

  it('rejects a second rate for the same class on the same date', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    await recordRate(client, ctx, {
      id: 'RATEA000000000000000000001',
      assetClass: 'USD',
      rateMinor: 500_000,
      asOf: '2026-08-01',
      source: 'manual',
      at: 1,
      auditId: 'AUDRA00000000000000000001A',
    })

    await expect(
      recordRate(client, ctx, {
        id: 'RATEDUP00000000000000000001'.slice(0, 26),
        assetClass: 'USD',
        rateMinor: 999_999,
        asOf: '2026-08-01',
        source: 'manual',
        at: 2,
        auditId: 'AUDRDUP0000000000000000001',
      }),
    ).rejects.toThrow()

    const rows = await client.db.select().from(rates)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.rateMinor).toBe(500_000)
  })

  it('exposes no update or delete path for rates', () => {
    // The constraint stops a duplicate; this stops the code from ever
    // rewriting one in place.
    const source = readFileSync('lib/rates/record.ts', 'utf8')
    expect(source).not.toMatch(/\.update\(\s*rates/)
    expect(source).not.toMatch(/\.delete\(\s*rates/)
    expect(source).not.toMatch(/onConflictDoUpdate/)
  })

  it('stores the scale alongside the rate, so it cannot be misread', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    await recordRate(client, ctx, {
      id: 'RATEUSD00000000000000000AA',
      assetClass: 'USD',
      rateMinor: 502_554,
      asOf: '2026-08-17',
      source: 'imported',
      at: 1,
      auditId: 'AUDUSD0000000000000000001A',
    })
    await recordRate(client, ctx, {
      id: 'RATEGLD00000000000000000AA',
      assetClass: 'GOLD',
      rateMinor: 750_000,
      asOf: '2026-08-17',
      source: 'imported',
      at: 2,
      auditId: 'AUDGLD0000000000000000001A',
    })

    const rows = await client.db.select().from(rates)
    // 50.2554 read at scale 2 would be 5,025.54 EGP per dollar — a 100-fold
    // error in every converted figure downstream.
    expect(rows.find((r) => r.assetClass === 'USD')?.scale).toBe(4)
    expect(rows.find((r) => r.assetClass === 'GOLD')?.scale).toBe(2)
  })
})
