import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { POST } from '../../app/api/corrections/card-consolidation/route'
import { authSessions, memberships } from '../../db/schema/index'
import { atomically } from '../../lib/data/atomically'
import { sessionCookieHeader } from '../helpers/auth'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { importFixture, type ImportedFixture } from '../helpers/imported'
import { resetTestRuntime, useTestRuntime } from '../helpers/runtime'
import { seedHousehold } from '../helpers/households'

/**
 * T046 — obligation 5 (contracts/http-api.md): success shape with both
 * cards; second call `409 already_applied`; non-migrated household
 * `409 not_applicable`; member and viewer `403`; unauthenticated `401`.
 */

async function sessionFor(
  client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
  userId: string,
  token: string,
): Promise<string> {
  await atomically(client, [
    client.db.insert(authSessions).values({
      id: `SESS-${token}`,
      userId,
      token,
      expiresAt: new Date(Date.now() + 999_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as never,
  ])
  return sessionCookieHeader(token)
}

describe('POST /api/corrections/card-consolidation', () => {
  let fixture: ImportedFixture | undefined
  let database: TestDatabase | undefined

  afterEach(async () => {
    await fixture?.database.dispose()
    fixture = undefined
    await database?.dispose()
    database = undefined
    resetTestRuntime()
  })

  it('401 with no session', async () => {
    fixture = await importFixture()
    useTestRuntime(fixture.database.client)
    const response = await POST(new Request('http://localhost/api/corrections/card-consolidation', { method: 'POST' }))
    expect(response.status).toBe(401)
  })

  it('succeeds for the owner, then refuses a second call with 409 already_applied', async () => {
    fixture = await importFixture()
    const client = fixture.database.client
    useTestRuntime(client)
    const cookie = await sessionFor(client, fixture.repository.context.userId, 'tok-consolidate-owner')

    const first = await POST(
      new Request('http://localhost/api/corrections/card-consolidation', { method: 'POST', headers: { cookie } }),
    )
    expect(first.status).toBe(200)
    const body = (await first.json()) as { applied: Array<{ card: string; amountMinor: number }> }
    expect(body.applied.map((a) => a.card).sort()).toEqual(['ADIB', 'HSBC'])
    expect(body.applied.find((a) => a.card === 'ADIB')?.amountMinor).toBe(60_000)
    expect(body.applied.find((a) => a.card === 'HSBC')?.amountMinor).toBe(0)

    const second = await POST(
      new Request('http://localhost/api/corrections/card-consolidation', { method: 'POST', headers: { cookie } }),
    )
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: 'already_applied' })
  })

  it('409 not_applicable on a household with no imported ADIB/HSBC seed data', async () => {
    database = await createTestDatabase()
    const client = database.client
    useTestRuntime(client)
    const ctx = await seedHousehold(client, {
      id: 'HNOTMIGRATEDC00000000000A',
      userId: 'UNOTMIGRATEDC00000000000A',
      email: 'fresh-consolidate@household.example',
    })
    const cookie = await sessionFor(client, ctx.userId, 'tok-not-applicable')

    const response = await POST(
      new Request('http://localhost/api/corrections/card-consolidation', { method: 'POST', headers: { cookie } }),
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'not_applicable' })
  })

  it('403 for member and viewer roles', async () => {
    fixture = await importFixture()
    const client = fixture.database.client
    useTestRuntime(client)

    for (const role of ['member', 'viewer']) {
      await client.db.update(memberships).set({ role }).where(eq(memberships.userId, fixture.repository.context.userId))
      const cookie = await sessionFor(client, fixture.repository.context.userId, `tok-role-${role}`)
      const response = await POST(
        new Request('http://localhost/api/corrections/card-consolidation', { method: 'POST', headers: { cookie } }),
      )
      expect(response.status, role).toBe(403)
      expect(await response.json()).toEqual({ error: 'forbidden', requires: 'admin' })
    }
  })
})
