import { afterEach, describe, expect, it } from 'vitest'
import { transactions } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import { assertNoCycle, recordCorrection } from '../../lib/data/corrections'
import { CorrectionCycleError } from '../../lib/errors'
import type { AppClient } from '../../db/client'
import type { HouseholdContext } from '../../lib/data/context'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'

/**
 * T070 — a linear correction chain is allowed; a cycle is rejected.
 *
 * The two-row cycle is the case the table CHECK cannot catch: `reverses_id !=
 * id` constrains a single row and cannot follow a foreign key to another one.
 * An earlier draft of the data model asserted "no cycles" as a CHECK, which
 * would have enforced nothing while reading as though it did.
 */

const HOUSEHOLD = 'H1AAAAAAAAAAAAAAAAAAAAAAAA'
const USER = 'U1AAAAAAAAAAAAAAAAAAAAAAAA'

describe('reverses_id cycle prevention', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('allows a linear chain: a correction may itself be corrected', async () => {
    const { client, ctx } = await setup()

    await insert(client, ctx, 'TXA00000000000000000000000', null, 30_000)
    await recordCorrection(client, ctx, {
      id: 'TXB00000000000000000000000',
      reversesId: 'TXA00000000000000000000000',
      occurredOn: '2026-08-01',
      kind: 'expense',
      amountMinor: 20_000,
      currency: 'EGP',
      rateId: null,
      at: 2,
      auditId: 'AUD200000000000000000000001',
    })
    await recordCorrection(client, ctx, {
      id: 'TXC00000000000000000000000',
      reversesId: 'TXB00000000000000000000000',
      occurredOn: '2026-08-01',
      kind: 'expense',
      amountMinor: 10_000,
      currency: 'EGP',
      rateId: null,
      at: 3,
      auditId: 'AUD300000000000000000000001',
    })

    const rows = await client.db.select().from(transactions)
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.id === 'TXC00000000000000000000000')?.reversesId).toBe(
      'TXB00000000000000000000000',
    )
  })

  it('rejects a two-row cycle, which no CHECK constraint can catch', async () => {
    const { client, ctx } = await setup()

    await insert(client, ctx, 'TXA00000000000000000000000', null, 30_000)
    await insert(client, ctx, 'TXB00000000000000000000000', 'TXA00000000000000000000000', 20_000)

    // B already reverses A. A row reversing B, whose id is A, would close the
    // loop: A -> B -> A. The walk sees A again and refuses.
    await expect(
      assertNoCycle(client, ctx, transactions, 'TXA00000000000000000000000', 'TXB00000000000000000000000'),
    ).rejects.toThrow(CorrectionCycleError)
  })

  it('rejects a longer cycle', async () => {
    const { client, ctx } = await setup()

    await insert(client, ctx, 'TXA00000000000000000000000', null, 30_000)
    await insert(client, ctx, 'TXB00000000000000000000000', 'TXA00000000000000000000000', 20_000)
    await insert(client, ctx, 'TXC00000000000000000000000', 'TXB00000000000000000000000', 10_000)

    await expect(
      assertNoCycle(client, ctx, transactions, 'TXA00000000000000000000000', 'TXC00000000000000000000000'),
    ).rejects.toThrow(CorrectionCycleError)
  })

  it('reports the chain it walked, so the cycle is visible', async () => {
    const { client, ctx } = await setup()
    await insert(client, ctx, 'TXA00000000000000000000000', null, 30_000)
    await insert(client, ctx, 'TXB00000000000000000000000', 'TXA00000000000000000000000', 20_000)

    let thrown: unknown
    try {
      await assertNoCycle(client, ctx, transactions, 'TXA00000000000000000000000', 'TXB00000000000000000000000')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(CorrectionCycleError)
    expect((thrown as CorrectionCycleError).chain).toEqual([
      'TXA00000000000000000000000',
      'TXB00000000000000000000000',
      'TXA00000000000000000000000',
    ])
  })

  it('lets the database reject a self-reversal, which is a single-row rule', async () => {
    const { client, ctx } = await setup()
    await expect(
      insert(client, ctx, 'TXSELF0000000000000000000A', 'TXSELF0000000000000000000A', 100),
    ).rejects.toThrow()
  })

  it('lets the database reject reversing the same row twice', async () => {
    const { client, ctx } = await setup()
    await insert(client, ctx, 'TXA00000000000000000000000', null, 30_000)
    await insert(client, ctx, 'TXB00000000000000000000000', 'TXA00000000000000000000000', 20_000)
    // The partial UNIQUE(household_id, reverses_id) makes this unrepresentable.
    await expect(
      insert(client, ctx, 'TXC00000000000000000000000', 'TXA00000000000000000000000', 10_000),
    ).rejects.toThrow()
  })

  async function setup(): Promise<{ client: AppClient; ctx: HouseholdContext }> {
    database = await createTestDatabase()
    const client = database.client
    const ctx = await seedHousehold(client, {
      id: HOUSEHOLD,
      userId: USER,
      email: 'owner@one.test',
    })
    return { client, ctx }
  }
})

async function insert(
  client: AppClient,
  ctx: HouseholdContext,
  id: string,
  reversesId: string | null,
  amountMinor: number,
): Promise<void> {
  await atomically(client, [
    client.db.insert(transactions).values({
      id,
      householdId: ctx.householdId,
      occurredOn: '2026-08-01',
      kind: 'expense',
      category: null,
      accountId: null,
      amountMinor,
      currency: 'EGP',
      rateId: null,
      note: null,
      reversesId,
      createdBy: ctx.userId,
      createdAt: 1,
    }) as never,
  ])
}
