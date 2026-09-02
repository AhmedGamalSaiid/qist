import { afterEach, describe, expect, it } from 'vitest'
import { GET as getState } from '../../app/api/state/route'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { resetTestRuntime, useTestRuntime } from '../helpers/runtime'

/**
 * T025 — contract obligation 1 (contracts/http-api.md): `401` on every data
 * route with no session, identical across "no cookie" and "garbage cookie".
 * Later phases extend this table as `app/api/cards/**` and
 * `app/api/corrections/**` land (their own 401 checks ship with T038/T046).
 */

const ROUTES: ReadonlyArray<{ name: string; call: (request: Request) => Promise<Response> }> = [
  { name: 'GET /api/state', call: (request) => getState(request) },
]

describe('401 semantics (obligation 1)', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
    resetTestRuntime()
  })

  for (const route of ROUTES) {
    it(`${route.name} — 401 with no session`, async () => {
      database = await createTestDatabase()
      useTestRuntime(database.client)

      const response = await route.call(new Request('http://localhost/api/x'))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthenticated' })
    })

    it(`${route.name} — 401 with a garbage cookie, identical body to no session`, async () => {
      database = await createTestDatabase()
      useTestRuntime(database.client)

      const response = await route.call(
        new Request('http://localhost/api/x', {
          headers: { cookie: 'better-auth.session_token=garbage' },
        }),
      )
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'unauthenticated' })
    })
  }
})
