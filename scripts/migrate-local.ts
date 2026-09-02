import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createLocalClient } from '../db/client-local'
import { applyMigrations } from '../lib/data/migrate'

/**
 * `npm run db:migrate:local [-- --db <path>]` — applies migrations to a local
 * SQLite file.
 *
 * The path is overridable (`--db`, matching `scripts/import.ts` and
 * `scripts/reconcile.ts`, or `LOCAL_DB_PATH`) so a scratch parity database
 * (quickstart V2) or a second household fixture can point somewhere else; it
 * defaults to `.data/local.db`, which is gitignored.
 */
function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    console.error(`${flag} needs a value`)
    process.exit(2)
  }
  return value
}

const path = argValue('--db', process.env.LOCAL_DB_PATH ?? '.data/local.db')
mkdirSync(dirname(path), { recursive: true })

const client = createLocalClient(path)
await applyMigrations(client)
client.raw.close()

console.log(`Applied migrations to ${path}`)
