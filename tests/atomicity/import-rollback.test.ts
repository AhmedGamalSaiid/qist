import { afterEach, describe, expect, it } from 'vitest'
import {
  accounts,
  cards,
  households,
  incomeSettings,
  installments,
  liabilities,
  propertyHoldings,
  rates,
  snapshots,
  transactions,
  users,
} from '../../db/schema/index'
import { DEFAULT_DUMP_PATH, Dump } from '../../lib/import/dump'
import { importDump } from '../../lib/import/importer'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { FIXED_NOW } from '../helpers/imported'

/**
 * T073 — a failure part-way through the import leaves the database **empty**,
 * not half-populated (FR-005a).
 *
 * A partial import is not idempotent, and it would leave the reconciliation
 * report reading against a half-populated database — which is worse than no
 * import at all, because the report would look clean while comparing wrong
 * numbers.
 *
 * Runs on both drivers.
 */

const ALL_TABLES = {
  households,
  users,
  accounts,
  propertyHoldings,
  liabilities,
  installments,
  transactions,
  cards,
  rates,
  snapshots,
} as const

describe('import atomicity', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('leaves nothing behind when a statement fails part-way through', async () => {
    database = await createTestDatabase()
    const client = database.client
    const dump = Dump.fromFile(DEFAULT_DUMP_PATH)

    // Fail the atom from inside, at the point every mapper has already run and
    // most statements have been built: a rate row whose class the CHECK
    // rejects. The failure lands well after the households and accounts
    // statements, so a non-atomic importer would leave those committed.
    const originalInsert = client.db.insert.bind(client.db)
    let installmentInserts = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(client.db as any).insert = (table: unknown) => {
      const builder = originalInsert(table as never)
      if (table === installments) {
        installmentInserts += 1
        if (installmentInserts === 30) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const poisoned: any = builder
          const originalValues = poisoned.values.bind(poisoned)
          poisoned.values = (row: Record<string, unknown>) =>
            originalValues({ ...row, householdId: 'NOSUCHHOUSEHOLD00000000000' })
          return poisoned
        }
      }
      return builder
    }

    await expect(importDump(client, dump, { now: FIXED_NOW })).rejects.toThrow()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(client.db as any).insert = originalInsert

    for (const [name, table] of Object.entries(ALL_TABLES)) {
      const rows = await client.db.select().from(table as typeof accounts)
      expect(rows, `${database.driver}: ${name} was left half-populated`).toHaveLength(0)
    }
    expect(await client.db.select().from(incomeSettings)).toHaveLength(0)
  })

  it('imports everything when nothing fails', async () => {
    database = await createTestDatabase()
    const dump = Dump.fromFile(DEFAULT_DUMP_PATH)
    const result = await importDump(database.client, dump, { now: FIXED_NOW })

    expect(result.counts.accounts).toBe(17)
    expect(await database.client.db.select().from(installments)).toHaveLength(56)
  })
})
