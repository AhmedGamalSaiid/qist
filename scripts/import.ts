import { createLocalClient } from '../db/client-local'
import { DEFAULT_DUMP_PATH, Dump } from '../lib/import/dump'
import { importDump } from '../lib/import/importer'
import { IncompleteDumpError, TimezonePreflightError } from '../lib/errors'

/**
 * `npm run import -- --dump migration/sheet-dump.json` (T060).
 *
 * Reports per-table row counts on success and the specific failure on refusal.
 * "Import failed" with a stack trace would tell the owner nothing they could
 * act on; "the dump stops at Installments row 40" tells them to re-extract.
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

const dumpPath = argValue('--dump', DEFAULT_DUMP_PATH)
const dbPath = argValue('--db', process.env.LOCAL_DB_PATH ?? '.data/local.db')

const client = createLocalClient(dbPath)

try {
  const dump = Dump.fromFile(dumpPath)
  const result = await importDump(client, dump, { now: Date.now() })

  console.log(`Imported ${dumpPath} -> ${dbPath}`)
  console.log(`  household        ${result.householdId}`)
  console.log(
    `  preflight        ${result.preflight.date} in both ` +
      `${result.preflight.sourceTimezone} and ${result.preflight.householdTimezone}`,
  )
  console.log('')
  const counts = result.counts
  const width = Math.max(...Object.keys(counts).map((k) => k.length))
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table.padEnd(width)}  ${String(count).padStart(4)}`)
  }
} catch (error) {
  if (error instanceof IncompleteDumpError || error instanceof TimezonePreflightError) {
    console.error(`\nRefusing to import.\n\n${error.message}\n`)
    process.exit(1)
  }
  throw error
} finally {
  client.raw.close()
}
