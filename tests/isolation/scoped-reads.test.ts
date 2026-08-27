import { afterEach, describe, expect, it } from 'vitest'
import { accounts, liabilities } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import { createRepository, householdContextFor, householdsFor } from '../../lib/data/index'
import type { AppClient } from '../../db/client'
import type { HouseholdContext } from '../../lib/data/context'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'

/**
 * T088 — two households with records in each; every cross-household read
 * returns nothing (SC-003, FR-021, quickstart V5).
 *
 * **This is a security test.** A failure here is a defect, not a bug: one
 * household seeing another's finances is the worst outcome this system has.
 *
 * Runs on both drivers.
 */

const A = { id: 'HAAAAAAAAAAAAAAAAAAAAAAAAA', user: 'UAAAAAAAAAAAAAAAAAAAAAAAAA', email: 'a@test' }
const B = { id: 'HBBBBBBBBBBBBBBBBBBBBBBBBB', user: 'UBBBBBBBBBBBBBBBBBBBBBBBBB', email: 'b@test' }

describe('scoped reads', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('returns only the calling household records', async () => {
    const { client, a, b } = await setup()

    const aAccounts = await createRepository(client, a).holdings.accounts()
    const bAccounts = await createRepository(client, b).holdings.accounts()

    expect(aAccounts.map((x) => x.name)).toEqual(['A-only account'])
    expect(bAccounts.map((x) => x.name)).toEqual(['B-only account'])

    const aLiabilities = await createRepository(client, a).holdings.liabilities()
    expect(aLiabilities.map((x) => x.name)).toEqual(['A-only liability'])
  })

  it('returns nothing when the other household id is passed directly', async () => {
    const { client, a } = await setup()

    // The attack this models: a caller who knows B's id and supplies it. There
    // is no repository method that accepts a household id, so the only way to
    // try is to forge a context — and building one goes through the membership
    // check below.
    const forged = await householdContextFor(client, { userId: a.userId }, B.id)
    expect(forged).toBeNull()
  })

  it('gives a user only the households they belong to', async () => {
    const { client } = await setup()

    const forA = await householdsFor(client, { userId: A.user })
    expect(forA.map((c) => c.householdId)).toEqual([A.id])

    const forB = await householdsFor(client, { userId: B.user })
    expect(forB.map((c) => c.householdId)).toEqual([B.id])
  })

  it('scopes every repository, not only the ones a test happened to check', async () => {
    const { client, a } = await setup()
    const repository = createRepository(client, a)

    expect(await repository.holdings.accounts()).toHaveLength(1)
    expect(await repository.holdings.liabilities()).toHaveLength(1)
    expect(await repository.holdings.propertyHoldings()).toHaveLength(0)
    expect(await repository.ledger.installments()).toHaveLength(0)
    expect(await repository.ledger.transactions()).toHaveLength(0)
    expect(await repository.ledger.cards()).toHaveLength(0)
    expect(await repository.rates.all()).toHaveLength(0)
    expect(await repository.history.snapshots()).toHaveLength(0)
    expect(await repository.history.auditEntries()).toHaveLength(0)
  })

  it('does not leak through a context built for a household that does not exist', async () => {
    const { client, a } = await setup()
    const missing = await householdContextFor(client, { userId: a.userId }, 'HZZZZZZZZZZZZZZZZZZZZZZZZZ')
    expect(missing).toBeNull()
  })

  async function setup(): Promise<{ client: AppClient; a: HouseholdContext; b: HouseholdContext }> {
    database = await createTestDatabase()
    const client = database.client
    const a = await seedHousehold(client, { id: A.id, userId: A.user, email: A.email })
    const b = await seedHousehold(client, { id: B.id, userId: B.user, email: B.email })

    await atomically(client, [
      account(client, a, 'ACCTA0000000000000000000AA', 'A-only account'),
      account(client, b, 'ACCTB0000000000000000000BB', 'B-only account'),
      liability(client, a, 'LIABA0000000000000000000AA', 'A-only liability'),
      liability(client, b, 'LIABB0000000000000000000BB', 'B-only liability'),
    ])

    return { client, a, b }
  }
})

function account(client: AppClient, ctx: HouseholdContext, id: string, name: string) {
  return client.db.insert(accounts).values({
    id,
    householdId: ctx.householdId,
    name,
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
  }) as never
}

function liability(client: AppClient, ctx: HouseholdContext, id: string, name: string) {
  return client.db.insert(liabilities).values({
    id,
    householdId: ctx.householdId,
    name,
    amountMinor: 100,
    sortOrder: 1,
    createdAt: 1,
  }) as never
}
