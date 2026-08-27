import { afterEach, describe, expect, it } from 'vitest'
import { households, transactions, users } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'

/**
 * T072 — a mid-write failure leaves no partial effect
 * (quickstart V9, US2 acceptance scenario 4, FR-014).
 *
 * **This suite runs on both drivers.** D1 has no interactive transactions, so
 * a write path shaped like `transaction(async tx => ...)` passes against
 * `better-sqlite3` and fails only in a Worker. Running the same body against
 * Wrangler's local D1 is what turns that from a caveat into a test.
 */

const HOUSEHOLD = 'H1AAAAAAAAAAAAAAAAAAAAAAAA'
const USER = 'U1AAAAAAAAAAAAAAAAAAAAAAAA'

describe('atomically', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('applies every statement or none of them', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    const good = client.db.insert(transactions).values({
      id: 'TXGOOD000000000000000000AA',
      householdId: ctx.householdId,
      occurredOn: '2026-08-01',
      kind: 'expense',
      category: null,
      accountId: null,
      amountMinor: 100,
      currency: 'EGP',
      rateId: null,
      note: null,
      reversesId: null,
      createdBy: ctx.userId,
      createdAt: 1,
    }) as never

    // A USD row with no rate violates `transactions_usd_needs_rate`. The first
    // statement is perfectly valid; the question is whether it survives.
    const bad = client.db.insert(transactions).values({
      id: 'TXBAD0000000000000000000AA',
      householdId: ctx.householdId,
      occurredOn: '2026-08-02',
      kind: 'income',
      category: null,
      accountId: null,
      amountMinor: 100,
      currency: 'USD',
      rateId: null,
      note: null,
      reversesId: null,
      createdBy: ctx.userId,
      createdAt: 2,
    }) as never

    await expect(atomically(client, [good, bad])).rejects.toThrow()

    const rows = await client.db.select().from(transactions)
    expect(rows, `${database.driver}: the good statement survived a failed atom`).toHaveLength(0)
  })

  it('commits everything when nothing fails', async () => {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'a@test' })

    await atomically(client, [
      client.db.insert(transactions).values({
        id: 'TX1000000000000000000000AA',
        householdId: ctx.householdId,
        occurredOn: '2026-08-01',
        kind: 'expense',
        category: null,
        accountId: null,
        amountMinor: 100,
        currency: 'EGP',
        rateId: null,
        note: null,
        reversesId: null,
        createdBy: ctx.userId,
        createdAt: 1,
      }) as never,
      client.db.insert(transactions).values({
        id: 'TX2000000000000000000000AA',
        householdId: ctx.householdId,
        occurredOn: '2026-08-02',
        kind: 'expense',
        category: null,
        accountId: null,
        amountMinor: 200,
        currency: 'EGP',
        rateId: null,
        note: null,
        reversesId: null,
        createdBy: ctx.userId,
        createdAt: 2,
      }) as never,
    ])

    const rows = await client.db.select().from(transactions)
    expect(rows).toHaveLength(2)
  })

  it('does nothing at all for an empty batch', async () => {
    database = await createTestDatabase()
    await expect(atomically(database.client, [])).resolves.toBeUndefined()
  })

  it('takes an array, not a callback — the signature is the guarantee', () => {
    // A callback API is implementable on better-sqlite3 and not on D1. Taking
    // an array makes a read-then-decide-then-write cycle inside the atom
    // inexpressible, which is why the restriction is in the type rather than
    // in a comment (R9a).
    expect(atomically.length).toBe(2)
    const asFunction: unknown = atomically
    expect(typeof asFunction).toBe('function')
  })

  it('rolls back a multi-table atom, not just the failing table', async () => {
    database = await createTestDatabase()
    const client = database.client

    // `memberships.role` is CHECK-constrained; 'sovereign' is not a role.
    const goodHousehold = client.db.insert(households).values({
      id: 'H9ZZZZZZZZZZZZZZZZZZZZZZZZ',
      name: 'Nine',
      baseCurrency: 'EGP',
      timezone: 'Africa/Cairo',
      createdAt: 1,
    }) as never
    const goodUser = client.db.insert(users).values({
      id: 'U9ZZZZZZZZZZZZZZZZZZZZZZZZ',
      email: 'nine@test',
      name: null,
      image: null,
      createdAt: 1,
    }) as never
    const badMembership = client.db.insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await import('../../db/schema/index')).memberships,
    ).values({
      id: 'M9ZZZZZZZZZZZZZZZZZZZZZZZZ',
      householdId: 'H9ZZZZZZZZZZZZZZZZZZZZZZZZ',
      userId: 'U9ZZZZZZZZZZZZZZZZZZZZZZZZ',
      role: 'sovereign',
      joinedAt: 1,
    }) as never

    await expect(atomically(client, [goodHousehold, goodUser, badMembership])).rejects.toThrow()

    expect(await client.db.select().from(households)).toHaveLength(0)
    expect(await client.db.select().from(users)).toHaveLength(0)
  })
})
