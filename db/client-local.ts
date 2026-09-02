import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { AppDatabase, LocalClient, LocalSqlite } from './client'
import * as schema from './schema/index'

/**
 * `better-sqlite3` setup. Node-only by construction — a Worker never reaches
 * this file, which is why the driver import lives here rather than in
 * `db/client.ts`.
 *
 * Foreign keys are OFF by default in SQLite. Without this pragma the composite
 * `(household_id, id)` foreign keys T028 exists to add would parse, migrate,
 * and enforce nothing — which is worse than not having them, because the
 * schema would claim a guarantee the database does not make.
 */
export function createLocalClient(path = ':memory:'): LocalClient {
  const sqlite = new Database(path)
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  return {
    kind: 'local',
    db: drizzle(sqlite, { schema }) as unknown as AppDatabase,
    raw: sqlite as unknown as LocalSqlite,
  }
}
