import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '../../app/api/state/route'
import { accounts, liabilities, rates } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import { createRepository, loadHouseholdState } from '../../lib/data/index'
import type { HouseholdContext } from '../../lib/data/context'
import { signedInHousehold } from '../helpers/auth'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { resetTestRuntime, useTestRuntime } from '../helpers/runtime'

/**
 * T025 — `GET /api/state` invoked as a plain function (contracts/http-api.md,
 * obligation 6): every section present in one response, and derived figures
 * match `deriveAll` on the same fixture (no drift between the endpoint and
 * the library).
 */

const HOUSEHOLD = 'HSTATE00000000000000000AA'
const USER = 'USTATE00000000000000000AA'

describe('GET /api/state', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
    resetTestRuntime()
  })

  it('returns 200 with every section, matching deriveAll on the same fixture', async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)

    const { context, cookie } = await signedInHousehold(client, {
      householdId: HOUSEHOLD,
      userId: USER,
      email: 'state@test.example',
      sessionToken: 'tok-state',
    })
    await seedFinancialData(client, context)

    const response = await GET(new Request('http://localhost/api/state', { headers: { cookie } }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>

    for (const key of [
      'householdId',
      'timezone',
      'today',
      'role',
      'accounts',
      'propertyHoldings',
      'liabilities',
      'installments',
      'transactions',
      'rates',
      'snapshots',
      'cards',
      'cardPayments',
      'derived',
    ]) {
      expect(body, `missing section "${key}"`).toHaveProperty(key)
    }

    expect(body.householdId).toBe(HOUSEHOLD)
    expect(body.role).toBe('owner')

    // No drift between the endpoint and the library: recompute independently
    // through the same repository and compare the derived block.
    const repository = createRepository(client, context)
    const expected = await loadHouseholdState(repository, { today: body.today as string })
    expect(body.derived).toEqual(expected.derived)
  })

  it('returns 401 with no session', async () => {
    database = await createTestDatabase()
    useTestRuntime(database.client)

    const response = await GET(new Request('http://localhost/api/state'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthenticated' })
  })

  it('returns 401 for an expired session', async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)

    const { cookie } = await signedInHousehold(client, {
      householdId: HOUSEHOLD,
      userId: USER,
      email: 'expired@test.example',
      sessionToken: 'tok-state-expired',
    })
    // Expire it immediately.
    await client.raw.exec(`UPDATE auth_sessions SET expires_at = 1 WHERE token = 'tok-state-expired'`)

    const response = await GET(new Request('http://localhost/api/state', { headers: { cookie } }))
    expect(response.status).toBe(401)
  })
})

async function seedFinancialData(
  client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
  context: HouseholdContext,
): Promise<void> {
  await atomically(client, [
    client.db.insert(accounts).values({
      id: 'ACCTSTATE00000000000000AA',
      householdId: context.householdId,
      name: 'Wallet',
      kind: 'asset',
      assetClass: 'EGP',
      isInvestment: 0,
      balanceMode: 'stated',
      quantityMinor: 500_00,
      openingQuantityMinor: null,
      openingDate: null,
      asOf: null,
      sortOrder: 1,
      archivedAt: null,
      createdAt: 1,
    }) as never,
    client.db.insert(liabilities).values({
      id: 'LIABSTATE0000000000000AAA',
      householdId: context.householdId,
      name: 'Credit line',
      amountMinor: 100_00,
      cardId: null,
      reversesId: null,
      sortOrder: 1,
      createdAt: 1,
    }) as never,
    // `holdingsByClass` looks up a rate for every convertible asset class
    // regardless of whether any account holds it (pre-existing 003
    // behavior) — all three must exist or the read throws `MissingRateError`.
    ...(['USD', 'GOLD', 'SILVER'] as const).map(
      (assetClass) =>
        client.db.insert(rates).values({
          id: `RATESTATE0000000000${assetClass}`,
          householdId: context.householdId,
          assetClass,
          rateMinor: 100,
          scale: 2,
          asOf: '2020-01-01',
          source: 'manual',
          createdBy: context.userId,
          createdAt: 1,
        }) as never,
    ),
  ])
}
