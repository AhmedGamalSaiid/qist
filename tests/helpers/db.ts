import type { AppClient } from '../../db/client'
import { createLocalClient } from '../../db/client-local'
import { createD1Client } from '../../db/client-d1'
import { applyMigrations } from '../../lib/data/migrate'

/**
 * One test harness, two drivers (R9a).
 *
 * `DB_DRIVER` is set by the vitest project, so the same test body runs against
 * `better-sqlite3` and against Wrangler's local D1 (Miniflare's `workerd`
 * implementation — the one `wrangler dev --local` binds). A write path that
 * succeeds on one and fails on the other is the failure this feature exists to
 * keep out of a deploy.
 */

export type Driver = 'better-sqlite3' | 'd1'

export function currentDriver(): Driver {
  return process.env.DB_DRIVER === 'd1' ? 'd1' : 'better-sqlite3'
}

export interface TestDatabase {
  readonly client: AppClient
  readonly driver: Driver
  dispose(): Promise<void>
}

export async function createTestDatabase(): Promise<TestDatabase> {
  if (currentDriver() === 'd1') {
    const { Miniflare } = await import('miniflare')
    const mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'data-foundation-test' },
    })
    const binding = await mf.getD1Database('DB')
    const client = createD1Client(binding)
    await applyMigrations(client)
    return {
      client,
      driver: 'd1',
      dispose: async () => {
        await mf.dispose()
      },
    }
  }

  const client = createLocalClient(':memory:')
  await applyMigrations(client)
  return {
    client,
    driver: 'better-sqlite3',
    dispose: async () => {
      client.raw.close()
    },
  }
}
