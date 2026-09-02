import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { GET, POST } from '../../app/api/cards/route'
import { PATCH } from '../../app/api/cards/[id]/route'
import { memberships } from '../../db/schema/index'
import { sessionCookieHeader, signedInHousehold } from '../helpers/auth'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { resetTestRuntime, useTestRuntime } from '../helpers/runtime'

/**
 * T038 — obligations 3–4 (contracts/http-api.md): `401` unauthenticated;
 * viewer `403` on POST/PATCH; the `422` validation table with reasons
 * payloads; `PATCH` on a foreign household's card id → `404`
 * byte-identical to a nonexistent id; success shapes (`201`/`200`).
 */

const A = { householdId: 'HCARDCA000000000000000AA', userId: 'UCARDCA000000000000000AA', email: 'cards-a@test.example' }
const B = { householdId: 'HCARDCB000000000000000BB', userId: 'UCARDCB000000000000000BB', email: 'cards-b@test.example' }

function patch(request: Request, id: string): Promise<Response> {
  return PATCH(request, { params: Promise.resolve({ id }) })
}

async function setRole(
  client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
  userId: string,
  role: string,
): Promise<void> {
  await client.db.update(memberships).set({ role }).where(eq(memberships.userId, userId))
}

describe('cards contract', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
    resetTestRuntime()
  })

  it('401 on GET/POST/PATCH with no session', async () => {
    database = await createTestDatabase()
    useTestRuntime(database.client)

    for (const response of await Promise.all([
      GET(new Request('http://localhost/api/cards')),
      POST(new Request('http://localhost/api/cards', { method: 'POST', body: '{}' })),
      patch(new Request('http://localhost/api/cards/x', { method: 'PATCH', body: '{}' }), 'x'),
    ])) {
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthenticated' })
    }
  })

  it('viewer gets 403 on POST and PATCH (obligation 3)', async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)
    const { cookie } = await signedInHousehold(client, { ...A, sessionToken: 'tok-viewer' })
    await setRole(client, A.userId, 'viewer')

    const post = await POST(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Should Fail' }),
      }),
    )
    expect(post.status).toBe(403)
    expect(await post.json()).toEqual({ error: 'forbidden', requires: 'writer' })

    const patchResponse = await patch(
      new Request('http://localhost/api/cards/whatever', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      }),
      'whatever',
    )
    expect(patchResponse.status).toBe(403)
  })

  it('viewer can still GET', async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)
    const { cookie } = await signedInHousehold(client, { ...A, sessionToken: 'tok-viewer-get' })
    await setRole(client, A.userId, 'viewer')

    const response = await GET(new Request('http://localhost/api/cards', { headers: { cookie } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ cards: [] })
  })

  it('the 422 validation table returns reasons and writes nothing', async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)
    const { cookie } = await signedInHousehold(client, { ...A, sessionToken: 'tok-422' })

    const cases: Array<Record<string, unknown>> = [
      { name: '' },
      { name: 'Dup' },
      { name: 'x'.repeat(200) },
      { name: 'Valid Enough', limitMinor: -1 },
      { name: 'Valid Enough Two', statementDay: 0 },
      { name: 'Valid Enough Three', dueDay: 32 },
      { name: 'Valid Enough Four', limitMinor: 12.5 },
    ]

    // Seed one card so the "Dup" case has something to collide with.
    await POST(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'dup' }),
      }),
    )

    for (const body of cases) {
      const response = await POST(
        new Request('http://localhost/api/cards', {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
      expect(response.status, JSON.stringify(body)).toBe(422)
      const json = (await response.json()) as { error: string; reasons: unknown[] }
      expect(json.error).toBe('invalid')
      expect(json.reasons.length).toBeGreaterThan(0)
    }

    const listing = await GET(new Request('http://localhost/api/cards', { headers: { cookie } }))
    const body = (await listing.json()) as { cards: unknown[] }
    expect(body.cards).toHaveLength(1)
  })

  it('POST returns 201 with the created card shape, GET reflects it, PATCH returns 200', async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)
    const { cookie } = await signedInHousehold(client, { ...A, sessionToken: 'tok-success' })

    const created = await POST(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New Card', dueDay: 5 }),
      }),
    )
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as { id: string; name: string; dueDay: number; balanceMinor: number }
    expect(createdBody).toMatchObject({ name: 'New Card', dueDay: 5, balanceMinor: 0 })

    const listing = await GET(new Request('http://localhost/api/cards', { headers: { cookie } }))
    const listingBody = (await listing.json()) as { cards: Array<{ id: string }> }
    expect(listingBody.cards.map((c) => c.id)).toContain(createdBody.id)

    const updated = await patch(
      new Request(`http://localhost/api/cards/${createdBody.id}`, {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ dueDay: 10 }),
      }),
      createdBody.id,
    )
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({ name: 'New Card', dueDay: 10 })
  })

  it('PATCH on a foreign household card id answers 404, identical to a nonexistent id', async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)
    const { cookie: cookieA } = await signedInHousehold(client, { ...A, sessionToken: 'tok-cross-a' })
    await signedInHousehold(client, { ...B, sessionToken: 'tok-cross-b' })

    const bCard = await createCardAs('tok-cross-b', 'B Card')

    const crossHousehold = await patch(
      new Request(`http://localhost/api/cards/${bCard}`, {
        method: 'PATCH',
        headers: { cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Hijacked' }),
      }),
      bCard,
    )
    const nonexistent = await patch(
      new Request('http://localhost/api/cards/does-not-exist', {
        method: 'PATCH',
        headers: { cookie: cookieA, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Hijacked' }),
      }),
      'does-not-exist',
    )

    expect(crossHousehold.status).toBe(404)
    expect(nonexistent.status).toBe(404)
    expect(await crossHousehold.json()).toEqual(await nonexistent.json())
  })

  async function createCardAs(sessionToken: string, name: string): Promise<string> {
    const response = await POST(
      new Request('http://localhost/api/cards', {
        method: 'POST',
        headers: { cookie: sessionCookieHeader(sessionToken), 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    )
    const body = (await response.json()) as { id: string }
    return body.id
  }
})
