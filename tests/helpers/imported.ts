import { createRepository, ownerContextFor } from '../../lib/data/index'
import type { Repository } from '../../lib/data/repository'
import { DEFAULT_DUMP_PATH, Dump } from '../../lib/import/dump'
import { importDump, type ImportResult } from '../../lib/import/importer'
import { createTestDatabase, type TestDatabase } from './db'

/** A fresh database with the committed dump imported into it. */
export interface ImportedFixture {
  readonly database: TestDatabase
  readonly dump: Dump
  readonly result: ImportResult
  readonly repository: Repository
}

export const FIXED_NOW = 1_787_000_000_000

export async function importFixture(): Promise<ImportedFixture> {
  const database = await createTestDatabase()
  const dump = Dump.fromFile(DEFAULT_DUMP_PATH)
  const result = await importDump(database.client, dump, { now: FIXED_NOW })

  const context = await ownerContextFor(database.client, result.householdId)
  if (context === null) {
    throw new Error('the import did not create an owner membership')
  }

  return {
    database,
    dump,
    result,
    repository: createRepository(database.client, context),
  }
}
