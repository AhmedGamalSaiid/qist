import { afterEach, describe, expect, it } from 'vitest'
import { recordRate } from '../../lib/rates/record'
import { rateHistory } from '../../lib/rates/lookup'
import { rateAge, rateAges, STALE_AFTER_DAYS } from '../../lib/rates/age'
import { createRepository } from '../../lib/data/repository'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'

/**
 * T080 — several rates for one asset across dates all remain retrievable
 * (SC-005, FR-017).
 *
 * Superseding a rate must not lose it. The spreadsheet keeps exactly one
 * number in `Rates!B2` and overwrites it, which is why no figure it ever
 * produced can be reproduced afterwards.
 */

const HOUSEHOLD = 'H1AAAAAAAAAAAAAAAAAAAAAAAA'
const USER = 'U1AAAAAAAAAAAAAAAAAAAAAAAA'

describe('rate history', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('keeps every recorded rate, none lost by being superseded', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    const dates = ['2026-06-01', '2026-07-01', '2026-08-17', '2026-09-01']
    for (const [index, asOf] of dates.entries()) {
      await recordRate(client, ctx, {
        id: `RATE${String(index).padStart(22, '0')}`,
        assetClass: 'USD',
        rateMinor: 480_000 + index * 10_000,
        asOf,
        source: 'manual',
        at: 1_000 + index,
        auditId: `AUDR${String(index).padStart(22, '0')}`,
      })
    }

    const repository = createRepository(client, ctx)
    const all = await repository.rates.all()
    expect(all).toHaveLength(dates.length)

    const history = rateHistory(all, 'USD')
    expect(history.map((r) => r.asOf)).toEqual([...dates].reverse())
    expect(history.map((r) => r.rateMinor)).toEqual([510_000, 500_000, 490_000, 480_000])
  })

  it('reports the age of the rate in use, and marks a stale one (FR-040)', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    await recordRate(client, ctx, {
      id: 'RATEOLD0000000000000000001',
      assetClass: 'USD',
      rateMinor: 500_000,
      asOf: '2026-08-01',
      source: 'manual',
      at: 1,
      auditId: 'AUDROLD000000000000000001A',
    })

    const repository = createRepository(client, ctx)
    const all = await repository.rates.all()

    const fresh = rateAge(all[0] as never, '2026-08-01')
    expect(fresh.ageInDays).toBe(0)
    expect(fresh.stale).toBe(false)

    const stale = rateAge(all[0] as never, '2026-08-27')
    expect(stale.ageInDays).toBe(26)
    expect(stale.ageInDays).toBeGreaterThan(STALE_AFTER_DAYS)
    expect(stale.stale).toBe(true)
    // A skipped fetch must never silently look like a current rate.
    expect(stale.description).toMatch(/STALE/)

    const ages = rateAges(all, '2026-08-27')
    expect(ages.get('USD')?.stale).toBe(true)
  })

  it('ignores rates dated after the day being asked about', async () => {
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
      rateMinor: 600_000,
      asOf: '2026-09-01',
      source: 'manual',
      at: 2,
      auditId: 'AUDRB00000000000000000001A',
    })

    const all = await createRepository(client, ctx).rates.all()
    const ages = rateAges(all, '2026-08-15')
    expect(ages.get('USD')?.asOf).toBe('2026-08-01')
  })
})
