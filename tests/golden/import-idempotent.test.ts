import { afterEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '../helpers/db'
import { DEFAULT_DUMP_PATH, Dump } from '../../lib/import/dump'
import { importDump } from '../../lib/import/importer'
import { FIXED_NOW } from '../helpers/imported'
import {
  accounts,
  cardPayments,
  cards,
  incomeSettings,
  installments,
  liabilities,
  propertyHoldings,
  rates,
  snapshots,
  transactions,
} from '../../db/schema/index'

/**
 * T046 — import twice, assert identical row counts **and identical ids**
 * (quickstart V2, SC-006).
 *
 * Identical counts alone would pass with random ULIDs and a delete-then-insert
 * importer. Identical ids is the assertion that makes a re-run a genuine
 * no-op (FR-003).
 */

const EXPECTED_COUNTS = {
  accounts: 17,
  propertyHoldings: 3,
  liabilities: 7,
  installments: 56,
  transactions: 1,
  cards: 4,
  cardPayments: 0,
  incomeSettings: 1,
  rates: 3,
  snapshots: 1,
} as const

describe('import idempotency', () => {
  let database: TestDatabase | undefined

  afterEach(async () => {
    await database?.dispose()
    database = undefined
  })

  it('produces the expected row counts on the first run', async () => {
    database = await createTestDatabase()
    const dump = Dump.fromFile(DEFAULT_DUMP_PATH)
    const result = await importDump(database.client, dump, { now: FIXED_NOW })

    for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
      expect(result.counts[table as keyof typeof EXPECTED_COUNTS], table).toBe(expected)
    }

    const rows = await database.client.db.select().from(accounts)
    expect(rows.filter((r) => r.kind === 'asset')).toHaveLength(15)
    expect(rows.filter((r) => r.kind === 'liability')).toHaveLength(2)
  })

  it('changes nothing on the second run — same counts and same ids', async () => {
    database = await createTestDatabase()
    const dump = Dump.fromFile(DEFAULT_DUMP_PATH)
    const client = database.client

    await importDump(client, dump, { now: FIXED_NOW })
    const first = await snapshotIds(client)

    await importDump(client, dump, { now: FIXED_NOW + 60_000 })
    const second = await snapshotIds(client)

    expect(second).toEqual(first)
  })

  it('keeps the same household id across runs', async () => {
    database = await createTestDatabase()
    const dump = Dump.fromFile(DEFAULT_DUMP_PATH)
    const a = await importDump(database.client, dump, { now: FIXED_NOW })
    const b = await importDump(database.client, dump, { now: FIXED_NOW + 1 })
    expect(b.householdId).toBe(a.householdId)
  })
})

async function snapshotIds(client: TestDatabase['client']) {
  const tables = {
    accounts,
    propertyHoldings,
    liabilities,
    installments,
    transactions,
    cards,
    cardPayments,
    rates,
    snapshots,
  }

  const out: Record<string, string[]> = {}
  for (const [name, table] of Object.entries(tables)) {
    const rows = await client.db.select().from(table as typeof accounts)
    out[name] = rows.map((r) => r.id).sort()
  }
  const settings = await client.db.select().from(incomeSettings)
  out.incomeSettings = settings.map((r) => r.householdId).sort()
  return out
}
