import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '../../app/api/state/route'
import { GET as getCards, POST as postCard } from '../../app/api/cards/route'
import { PATCH as patchCard } from '../../app/api/cards/[id]/route'
import { accounts, rates } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import type { HouseholdContext } from '../../lib/data/context'
import { signedInHousehold } from '../helpers/auth'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { resetTestRuntime, useTestRuntime } from '../helpers/runtime'

/**
 * T026 — the session-derived adversarial matrix (spec SC-002, quickstart V5).
 *
 * Two households seeded with distinct data; one user probes the other's
 * household by naming its identifiers explicitly wherever a request could
 * carry one (path, query, body, header) — every attempt is answered exactly
 * as if the target household did not exist, and zero foreign rows appear in
 * any response. `GET /api/state` takes no request-supplied identifier at
 * all (contracts/http-api.md), so the adversarial surface here is: no header
 * or query string naming B's id changes what A's own session resolves to.
 */

const A = { householdId: 'HADVA0000000000000000000A', userId: 'UADVA0000000000000000000A', email: 'a@adv.example' }
const B = { householdId: 'HADVB0000000000000000000B', userId: 'UADVB0000000000000000000B', email: 'b@adv.example' }

describe('session-derived isolation (SC-002)', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
    resetTestRuntime()
  })

  it("A's session never resolves B's household, even when a request explicitly names it", async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)

    const { context: contextA, cookie: cookieA } = await signedInHousehold(client, {
      householdId: A.householdId,
      userId: A.userId,
      email: A.email,
      sessionToken: 'tok-adv-a',
    })
    const { context: contextB } = await signedInHousehold(client, {
      householdId: B.householdId,
      userId: B.userId,
      email: B.email,
      sessionToken: 'tok-adv-b',
    })
    await seedRates(client, contextA)
    await seedRates(client, contextB)
    await seedAccount(client, contextA, 'ACCTADVA000000000000000A', 'A-only account')
    await seedAccount(client, contextB, 'ACCTADVB000000000000000B', 'B-only account')

    // Every plausible way a request could try to name B's household: query
    // string, a header, and (since GET has no body) nothing else applies.
    // None of these fields exist in the state contract — this proves it.
    const probes = [
      new Request(`http://localhost/api/state?householdId=${B.householdId}`, { headers: { cookie: cookieA } }),
      new Request('http://localhost/api/state', {
        headers: { cookie: cookieA, 'x-household-id': B.householdId },
      }),
      new Request(`http://localhost/api/state?household=${B.householdId}&as=${B.userId}`, {
        headers: { cookie: cookieA },
      }),
    ]

    for (const request of probes) {
      const response = await GET(request)
      expect(response.status).toBe(200)
      const body = (await response.json()) as { householdId: string; accounts: Array<{ name: string }> }
      expect(body.householdId).toBe(A.householdId)
      expect(body.accounts.map((a) => a.name)).toEqual(['A-only account'])
      expect(body.accounts.map((a) => a.name)).not.toContain('B-only account')
    }
  })

  it('an unauthenticated probe naming a real household id discloses nothing', async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)
    const { context } = await signedInHousehold(client, {
      householdId: A.householdId,
      userId: A.userId,
      email: A.email,
      sessionToken: 'tok-adv-a2',
    })
    await seedRates(client, context)
    await seedAccount(client, context, 'ACCTADVA100000000000000A', 'Secret account')

    const response = await GET(
      new Request(`http://localhost/api/state?householdId=${A.householdId}`, {
        headers: { 'x-household-id': A.householdId },
      }),
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthenticated' })
  })

  it("T039 — B's cards are invisible to A's GET and unmodifiable via A's PATCH, even naming B's card id directly", async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)

    const { cookie: cookieA } = await signedInHousehold(client, {
      householdId: A.householdId,
      userId: A.userId,
      email: A.email,
      sessionToken: 'tok-adv-cards-a',
    })
    const { cookie: cookieB } = await signedInHousehold(client, {
      householdId: B.householdId,
      userId: B.userId,
      email: B.email,
      sessionToken: 'tok-adv-cards-b',
    })

    const bCardResponse = await postCard(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { cookie: cookieB, 'content-type': 'application/json' },
        body: JSON.stringify({ name: "B's secret card" }),
      }),
    )
    const bCard = (await bCardResponse.json()) as { id: string }

    // A's own GET never lists B's card.
    const aListing = await getCards(new Request('http://localhost/api/cards', { headers: { cookie: cookieA } }))
    const aBody = (await aListing.json()) as { cards: Array<{ id: string; name: string }> }
    expect(aBody.cards.map((c) => c.id)).not.toContain(bCard.id)
    expect(aBody.cards.map((c) => c.name)).not.toContain("B's secret card")

    // A naming B's card id directly in the path gets the uniform 404 — the
    // same answer as any id that does not exist at all.
    const hijack = await patchCard(
      new Request(`http://localhost/api/cards/${bCard.id}`, {
        method: 'PATCH',
        headers: { cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Hijacked' }),
      }),
      { params: Promise.resolve({ id: bCard.id }) },
    )
    expect(hijack.status).toBe(404)
    expect(await hijack.json()).toEqual({ error: 'not_found' })

    // B's card is untouched.
    const bListing = await getCards(new Request('http://localhost/api/cards', { headers: { cookie: cookieB } }))
    const bBody = (await bListing.json()) as { cards: Array<{ id: string; name: string }> }
    expect(bBody.cards).toEqual([expect.objectContaining({ id: bCard.id, name: "B's secret card" })])
  })
})

async function seedAccount(
  client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
  context: HouseholdContext,
  id: string,
  name: string,
): Promise<void> {
  await atomically(client, [
    client.db.insert(accounts).values({
      id,
      householdId: context.householdId,
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
    }) as never,
  ])
}

async function seedRates(
  client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
  context: HouseholdContext,
): Promise<void> {
  await atomically(
    client,
    (['USD', 'GOLD', 'SILVER'] as const).map(
      (assetClass) =>
        client.db.insert(rates).values({
          id: `RATEADV${context.householdId}${assetClass}`,
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
  )
}
