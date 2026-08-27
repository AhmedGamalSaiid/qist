import { afterEach, describe, expect, it } from 'vitest'
import { accounts, cardPayments, cards, rates, transactions } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import type { AppClient } from '../../db/client'
import type { HouseholdContext } from '../../lib/data/context'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'

/**
 * T089 — a transaction in household A referencing an account in household B is
 * **rejected by the database**, not merely absent from reads.
 *
 * This is the gap composite foreign keys exist to close and scoped reads
 * cannot cover. A `household_id` column and a scoped `SELECT` stop A from
 * *reading* B's rows; neither stops A from *pointing at* one. The reference
 * itself has to carry the constraint, which is why every cross-table foreign
 * key is `(household_id, id)` against a `UNIQUE(household_id, id)` parent key.
 *
 * Runs on both drivers.
 */

const A = { id: 'HAAAAAAAAAAAAAAAAAAAAAAAAA', user: 'UAAAAAAAAAAAAAAAAAAAAAAAAA', email: 'a@test' }
const B = { id: 'HBBBBBBBBBBBBBBBBBBBBBBBBB', user: 'UBBBBBBBBBBBBBBBBBBBBBBBBB', email: 'b@test' }

const ACCOUNT_IN_B = 'ACCTINB000000000000000000B'
const RATE_IN_B = 'RATEINB000000000000000000B'
const CARD_IN_B = 'CARDINB000000000000000000B'

describe('cross-household foreign keys', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('rejects a transaction in A that references an account in B', async () => {
    const { client, a } = await setup()

    await expect(
      atomically(client, [
        client.db.insert(transactions).values({
          id: 'TXCROSSACCOUNT000000000AAA',
          householdId: a.householdId,
          occurredOn: '2026-08-01',
          kind: 'expense',
          category: null,
          // B's account. Nothing about this row is malformed except the
          // household the account belongs to.
          accountId: ACCOUNT_IN_B,
          amountMinor: 100,
          currency: 'EGP',
          rateId: null,
          note: null,
          reversesId: null,
          createdBy: a.userId,
          createdAt: 1,
        }) as never,
      ]),
    ).rejects.toThrow()

    expect(await client.db.select().from(transactions)).toHaveLength(0)
  })

  it('rejects a transaction in A that pins a rate belonging to B', async () => {
    const { client, a } = await setup()

    await expect(
      atomically(client, [
        client.db.insert(transactions).values({
          id: 'TXCROSSRATE0000000000000AA',
          householdId: a.householdId,
          occurredOn: '2026-08-01',
          kind: 'income',
          category: null,
          accountId: null,
          amountMinor: 100,
          currency: 'USD',
          rateId: RATE_IN_B,
          note: null,
          reversesId: null,
          createdBy: a.userId,
          createdAt: 1,
        }) as never,
      ]),
    ).rejects.toThrow()
  })

  it('rejects a card payment in A against a card in B', async () => {
    const { client, a } = await setup()

    await expect(
      atomically(client, [
        client.db.insert(cardPayments).values({
          id: 'CPCROSS00000000000000000AA',
          householdId: a.householdId,
          cardId: CARD_IN_B,
          dueOn: '2026-09-01',
          amountMinor: 100,
          paidAt: null,
          createdAt: 1,
        }) as never,
      ]),
    ).rejects.toThrow()
  })

  it('rejects a correction in A that reverses a transaction in B', async () => {
    const { client, a, b } = await setup()

    await atomically(client, [
      client.db.insert(transactions).values({
        id: 'TXINB00000000000000000000B',
        householdId: b.householdId,
        occurredOn: '2026-08-01',
        kind: 'expense',
        category: null,
        accountId: null,
        amountMinor: 100,
        currency: 'EGP',
        rateId: null,
        note: null,
        reversesId: null,
        createdBy: b.userId,
        createdAt: 1,
      }) as never,
    ])

    await expect(
      atomically(client, [
        client.db.insert(transactions).values({
          id: 'TXCROSSREVERSE000000000AAA',
          householdId: a.householdId,
          occurredOn: '2026-08-01',
          kind: 'expense',
          category: null,
          accountId: null,
          amountMinor: 50,
          currency: 'EGP',
          rateId: null,
          note: null,
          reversesId: 'TXINB00000000000000000000B',
          createdBy: a.userId,
          createdAt: 2,
        }) as never,
      ]),
    ).rejects.toThrow()
  })

  it('accepts the same reference within one household', async () => {
    const { client, b } = await setup()

    await atomically(client, [
      client.db.insert(transactions).values({
        id: 'TXWITHINB0000000000000000B',
        householdId: b.householdId,
        occurredOn: '2026-08-01',
        kind: 'expense',
        category: null,
        accountId: ACCOUNT_IN_B,
        amountMinor: 100,
        currency: 'EGP',
        rateId: null,
        note: null,
        reversesId: null,
        createdBy: b.userId,
        createdAt: 1,
      }) as never,
    ])

    expect(await client.db.select().from(transactions)).toHaveLength(1)
  })

  async function setup(): Promise<{ client: AppClient; a: HouseholdContext; b: HouseholdContext }> {
    database = await createTestDatabase()
    const client = database.client
    const a = await seedHousehold(client, { id: A.id, userId: A.user, email: A.email })
    const b = await seedHousehold(client, { id: B.id, userId: B.user, email: B.email })

    await atomically(client, [
      client.db.insert(accounts).values({
        id: ACCOUNT_IN_B,
        householdId: b.householdId,
        name: 'B account',
        kind: 'asset',
        assetClass: 'EGP',
        isInvestment: 0,
        balanceMode: 'stated',
        quantityMinor: 100,
        openingQuantityMinor: null,
        openingDate: null,
        asOf: null,
        sortOrder: 1,
        archivedAt: null,
        createdAt: 1,
      }) as never,
      client.db.insert(rates).values({
        id: RATE_IN_B,
        householdId: b.householdId,
        assetClass: 'USD',
        rateMinor: 502_554,
        scale: 4,
        asOf: '2026-08-17',
        source: 'manual',
        createdBy: b.userId,
        createdAt: 1,
      }) as never,
      client.db.insert(cards).values({
        id: CARD_IN_B,
        householdId: b.householdId,
        name: 'B card',
        limitMinor: null,
        statementDay: null,
        dueDay: null,
        sortOrder: 1,
        createdAt: 1,
      }) as never,
    ])

    return { client, a, b }
  }
})
