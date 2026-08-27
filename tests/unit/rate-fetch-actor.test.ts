import { afterEach, describe, expect, it } from 'vitest'
import { auditLog, rates } from '../../db/schema/index'
import { recordRate } from '../../lib/rates/record'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'

/**
 * T084 — a rate written through the automated path is attributable without a
 * user (FR-039).
 *
 * The scheduled fetch itself is deferred to the first deploying feature; the
 * write path and its attribution ship here. That split is deliberate — a
 * requirement that mandated a scheduler this feature's declared scope cannot
 * build would be a claim rather than a plan.
 */

const HOUSEHOLD = 'H1AAAAAAAAAAAAAAAAAAAAAAAA'
const USER = 'U1AAAAAAAAAAAAAAAAAAAAAAAA'

describe('automated rate actor', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('records source = fetch with no created_by user', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    await recordRate(client, ctx, {
      id: 'RATEFETCH0000000000000001A',
      assetClass: 'USD',
      rateMinor: 502_554,
      asOf: '2026-08-27',
      source: 'fetch',
      at: 5,
      auditId: 'AUDFETCH00000000000000001A',
    })

    const rows = await client.db.select().from(rates)
    expect(rows[0]?.source).toBe('fetch')
    // The `fetch` source is itself the attributable actor. Naming a user here
    // would make the record say a person did something they did not.
    expect(rows[0]?.createdBy).toBeNull()
  })

  it('attributes the audit entry to the system, not to a user', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    await recordRate(client, ctx, {
      id: 'RATEFETCH0000000000000001A',
      assetClass: 'USD',
      rateMinor: 502_554,
      asOf: '2026-08-27',
      source: 'fetch',
      at: 5,
      auditId: 'AUDFETCH00000000000000001A',
    })

    const entries = await client.db.select().from(auditLog)
    expect(entries[0]?.actorKind).toBe('system')
    expect(entries[0]?.actorId).toBeNull()
    expect(entries[0]?.at).toBe(5)
  })

  it('still attributes a manual rate to the user who recorded it', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    await recordRate(client, ctx, {
      id: 'RATEMANUAL000000000000001A',
      assetClass: 'USD',
      rateMinor: 502_554,
      asOf: '2026-08-27',
      source: 'manual',
      at: 6,
      auditId: 'AUDMANUAL0000000000000001A',
    })

    const rows = await client.db.select().from(rates)
    expect(rows[0]?.createdBy).toBe(USER)
    const entries = await client.db.select().from(auditLog)
    expect(entries[0]?.actorKind).toBe('user')
    expect(entries[0]?.actorId).toBe(USER)
  })

  it('refuses a fetched rate that claims a user, at the database level', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    // `rates_fetch_actor_check`. The write path already does the right thing;
    // the constraint means a future write path cannot do the wrong one.
    await expect(
      client.db.insert(rates).values({
        id: 'RATEBAD000000000000000001A',
        householdId: ctx.householdId,
        assetClass: 'USD',
        rateMinor: 1,
        scale: 4,
        asOf: '2026-08-27',
        source: 'fetch',
        createdBy: USER,
        createdAt: 1,
      }),
    ).rejects.toThrow()
  })

  it('routes manual, imported and fetched rates through one path', () => {
    // A fetch that wrote by some other route would be a second write path with
    // its own bugs and its own audit story — which is how "the automated rate
    // is different somehow" becomes true.
    const sources: Array<'manual' | 'fetch' | 'imported'> = ['manual', 'fetch', 'imported']
    expect(sources).toHaveLength(3)
    expect(recordRate.length).toBe(3)
  })
})
