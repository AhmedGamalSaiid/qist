import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createLocalClient } from '../db/client-local'
import { applyMigrations } from '../lib/data/migrate'

/**
 * `npm run db:migrate:local` — applies migrations to the local SQLite file.
 *
 * The path is overridable so a test or a second household fixture can point
 * somewhere else; it defaults to `.data/local.db`, which is gitignored.
 */
const path = process.env.LOCAL_DB_PATH ?? '.data/local.db'
mkdirSync(dirname(path), { recursive: true })

const client = createLocalClient(path)
await applyMigrations(client)
client.raw.close()

console.log(`Applied migrations to ${path}`)
