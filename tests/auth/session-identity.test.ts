import { afterEach, describe, expect, it } from 'vitest'
import { authSessions, households, memberships, users } from '../../db/schema/index'
import { createAuth } from '../../lib/auth/config'
import { requireContext } from '../../lib/auth/context'
import { sessionIdentity } from '../../lib/auth/session'
import { MultipleHouseholdsError, NoHouseholdError, UnauthenticatedError } from '../../lib/errors'
import { atomically } from '../../lib/data/atomically'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { seedHousehold } from '../helpers/households'
import { sessionCookieHeader, TEST_AUTH_ENV } from '../helpers/auth'

/**
 * T024 — session → `Identity` binding (spec FR-006), and expired/revoked
 * sessions answering identically to no session (FR-004).
 *
 * Better Auth is exercised through its own `auth.api.getSession` — the real
 * cookie-verification code path — against a session row inserted directly.
 * Google's endpoints are never called (research.md R12): that is Better
 * Auth's own tested code, not our seam.
 */

const HOUSEHOLD = 'HSESS0000000000000000000AA'
const USER = 'USESS0000000000000000000AA'
const NOW = 1_800_000_000_000
// Better Auth's own `getSession` compares `expiresAt` against the real wall
// clock internally (not an injectable clock), so session expiry in these
// tests must be relative to actual `Date.now()` — the fixed `NOW` constant
// above (used for household/audit timestamps, which Better Auth never reads)
// is not necessarily in the past relative to whenever the suite runs.
const REAL_NOW = Date.now()

describe('sessionIdentity', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('resolves a valid session to the Identity that holds it', async () => {
    const { client } = await setup()
    const auth = createAuth(client, TEST_AUTH_ENV)

    await insertSession(client, { id: 'SESSVALID000000000000000AA', token: 'tok-valid', expiresAt: REAL_NOW + 999_000 })

    const request = new Request('http://localhost/api/state', {
      headers: { cookie: sessionCookieHeader('tok-valid') },
    })

    const identity = await sessionIdentity(request, auth)
    expect(identity).toEqual({ userId: USER })
  })

  it('returns null for no session', async () => {
    const { client } = await setup()
    const auth = createAuth(client, TEST_AUTH_ENV)

    const request = new Request('http://localhost/api/state')
    expect(await sessionIdentity(request, auth)).toBeNull()
  })

  it('returns null for an expired session — indistinguishable from no session', async () => {
    const { client } = await setup()
    const auth = createAuth(client, TEST_AUTH_ENV)

    await insertSession(client, { id: 'SESSEXPIRED00000000000000A', token: 'tok-expired', expiresAt: REAL_NOW - 1_000 })

    const request = new Request('http://localhost/api/state', {
      headers: { cookie: sessionCookieHeader('tok-expired') },
    })

    expect(await sessionIdentity(request, auth)).toBeNull()
  })

  it('returns null for a revoked (deleted) session', async () => {
    const { client } = await setup()
    const auth = createAuth(client, TEST_AUTH_ENV)

    const token = 'tok-revoked'
    await insertSession(client, { id: 'SESSREVOKED00000000000000A', token, expiresAt: REAL_NOW + 999_000 })

    const cookie = sessionCookieHeader(token)
    const before = await sessionIdentity(new Request('http://localhost/api/state', { headers: { cookie } }), auth)
    expect(before).toEqual({ userId: USER })

    // Sign-out invalidates the server-side session row (contracts/http-api.md).
    await client.raw.exec(`DELETE FROM auth_sessions WHERE token = 'tok-revoked'`)

    const after = await sessionIdentity(new Request('http://localhost/api/state', { headers: { cookie } }), auth)
    expect(after).toBeNull()
  })

  it('rejects a garbage cookie the same way as no cookie at all', async () => {
    const { client } = await setup()
    const auth = createAuth(client, TEST_AUTH_ENV)

    const request = new Request('http://localhost/api/state', {
      headers: { cookie: 'better-auth.session_token=not-a-valid-signed-value' },
    })
    expect(await sessionIdentity(request, auth)).toBeNull()
  })

  async function setup(): Promise<{ client: Awaited<ReturnType<typeof createTestDatabase>>['client'] }> {
    database = await createTestDatabase()
    const client = database.client
    await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'sess@test.example', at: NOW })
    return { client }
  }

  async function insertSession(
    client: Awaited<ReturnType<typeof createTestDatabase>>['client'],
    input: { id: string; token: string; expiresAt: number },
  ): Promise<void> {
    await atomically(client, [
      client.db.insert(authSessions).values({
        id: input.id,
        userId: USER,
        token: input.token,
        expiresAt: new Date(input.expiresAt),
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      }) as never,
    ])
  }
})

describe('requireContext', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('throws UnauthenticatedError with no session', async () => {
    database = await createTestDatabase()
    const client = database.client
    await expect(requireContext(new Request('http://localhost/api/state'), client, TEST_AUTH_ENV)).rejects.toThrow(
      UnauthenticatedError,
    )
  })

  it('throws NoHouseholdError for a valid session with zero memberships', async () => {
    database = await createTestDatabase()
    const client = database.client

    // A bare user row with no household — the auth-hook contract says
    // provisioning always accompanies user creation, but the data layer must
    // still fail safely if it ever doesn't (spec edge case).
    await atomically(client, [
      client.db.insert(users).values({
        id: 'UORPHAN0000000000000000AA',
        email: 'orphan@test.example',
        name: null,
        image: null,
        createdAt: NOW,
      }) as never,
      client.db.insert(authSessions).values({
        id: 'SESSORPHAN00000000000000A',
        userId: 'UORPHAN0000000000000000AA',
        token: 'tok-orphan',
        expiresAt: new Date(REAL_NOW + 999_000),
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      }) as never,
    ])

    const request = new Request('http://localhost/api/state', {
      headers: { cookie: sessionCookieHeader('tok-orphan') },
    })
    await expect(requireContext(request, client, TEST_AUTH_ENV)).rejects.toThrow(NoHouseholdError)
  })

  it('resolves the sole household for a normal session', async () => {
    database = await createTestDatabase()
    const client = database.client
    await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'sole@test.example', at: NOW })
    await atomically(client, [
      client.db.insert(authSessions).values({
        id: 'SESSSOLE0000000000000000A',
        userId: USER,
        token: 'tok-sole',
        expiresAt: new Date(REAL_NOW + 999_000),
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      }) as never,
    ])

    const request = new Request('http://localhost/api/state', {
      headers: { cookie: sessionCookieHeader('tok-sole') },
    })
    const context = await requireContext(request, client, TEST_AUTH_ENV)
    expect(context.householdId).toBe(HOUSEHOLD)
    expect(context.userId).toBe(USER)
  })

  it('throws MultipleHouseholdsError when the session user holds more than one membership', async () => {
    database = await createTestDatabase()
    const client = database.client
    await seedHousehold(client, { id: HOUSEHOLD, userId: USER, email: 'multi@test.example', at: NOW })
    const secondHousehold = 'HSESS0000000000000000000BB'
    await atomically(client, [
      client.db.insert(households).values({
        id: secondHousehold,
        name: 'Second',
        baseCurrency: 'EGP',
        timezone: 'Africa/Cairo',
        createdAt: NOW,
      }) as never,
      client.db.insert(memberships).values({
        id: 'MSESS0000000000000000000BB',
        householdId: secondHousehold,
        userId: USER,
        role: 'member',
        joinedAt: NOW,
      }) as never,
      client.db.insert(authSessions).values({
        id: 'SESSMULTI000000000000000A',
        userId: USER,
        token: 'tok-multi',
        expiresAt: new Date(REAL_NOW + 999_000),
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
      }) as never,
    ])

    const request = new Request('http://localhost/api/state', {
      headers: { cookie: sessionCookieHeader('tok-multi') },
    })
    await expect(requireContext(request, client, TEST_AUTH_ENV)).rejects.toThrow(MultipleHouseholdsError)
  })
})
