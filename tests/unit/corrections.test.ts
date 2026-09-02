import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { transactions } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import { netEntries, recordCorrection } from '../../lib/data/corrections'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'

/**
 * T069 — a correction is a new entry that references the original (FR-015).
 *
 * The original survives. That is the point: a household that cannot see what it
 * previously believed cannot audit itself, and an in-place edit destroys
 * exactly that.
 */

describe('corrections', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('keeps the original, links the correction, and nets the total', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, {
      id: 'H1AAAAAAAAAAAAAAAAAAAAAAAA',
      userId: 'U1AAAAAAAAAAAAAAAAAAAAAAAA',
      email: 'owner@one.test',
    })

    await atomically(client, [
      client.db.insert(transactions).values({
        id: 'TXORIGINAL0000000000000000',
        householdId: ctx.householdId,
        occurredOn: '2026-08-01',
        kind: 'expense',
        category: 'Groceries',
        accountId: null,
        amountMinor: 50_000,
        currency: 'EGP',
        rateId: null,
        note: 'typed 500.00 by mistake',
        reversesId: null,
        createdBy: ctx.userId,
        createdAt: 1,
      }) as never,
    ])

    await recordCorrection(client, ctx, {
      id: 'TXCORRECTION00000000000000',
      reversesId: 'TXORIGINAL0000000000000000',
      occurredOn: '2026-08-01',
      kind: 'expense',
      amountMinor: 5_000,
      currency: 'EGP',
      rateId: null,
      category: 'Groceries',
      note: 'actually 50.00',
      at: 2,
      auditId: 'AUDITCORRECTION00000000001',
    })

    const rows = await client.db
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, ctx.householdId))

    // Both rows are still there. Nothing was edited and nothing was deleted.
    expect(rows).toHaveLength(2)
    const original = rows.find((r) => r.id === 'TXORIGINAL0000000000000000')
    expect(original?.amountMinor).toBe(50_000)
    expect(original?.note).toBe('typed 500.00 by mistake')

    const correction = rows.find((r) => r.id === 'TXCORRECTION00000000000000')
    expect(correction?.reversesId).toBe('TXORIGINAL0000000000000000')

    // FR-016: derived totals reflect the net effect, not the sum of both.
    const net = netEntries(rows)
    expect(net).toHaveLength(1)
    expect(net[0]?.id).toBe('TXCORRECTION00000000000000')
    expect(net.reduce((sum, r) => sum + r.amountMinor, 0)).toBe(5_000)
  })

  it('refuses to correct a transaction in another household', async () => {
    database = await createTestDatabase()
    const client = database.client
    const a = await seedHousehold(client, {
      id: 'H1AAAAAAAAAAAAAAAAAAAAAAAA',
      userId: 'U1AAAAAAAAAAAAAAAAAAAAAAAA',
      email: 'owner@one.test',
    })
    const b = await seedHousehold(client, {
      id: 'H2BBBBBBBBBBBBBBBBBBBBBBBB',
      userId: 'U2BBBBBBBBBBBBBBBBBBBBBBBB',
      email: 'owner@two.test',
    })

    await atomically(client, [
      client.db.insert(transactions).values({
        id: 'TXINHOUSEHOLDA000000000000',
        householdId: a.householdId,
        occurredOn: '2026-08-01',
        kind: 'expense',
        category: null,
        accountId: null,
        amountMinor: 100,
        currency: 'EGP',
        rateId: null,
        note: null,
        reversesId: null,
        createdBy: a.userId,
        createdAt: 1,
      }) as never,
    ])

    await expect(
      recordCorrection(client, b, {
        id: 'TXCROSSHOUSEHOLD0000000000',
        reversesId: 'TXINHOUSEHOLDA000000000000',
        occurredOn: '2026-08-01',
        kind: 'expense',
        amountMinor: 50,
        currency: 'EGP',
        rateId: null,
        at: 2,
        auditId: 'AUDITCROSS0000000000000001',
      }),
    ).rejects.toThrow(/no such transaction in this household/)
  })
})
