import { writeFileSync } from 'node:fs'
import { createLocalClient } from '../db/client-local'
import { createRepository, listHouseholdIds, ownerContextFor } from '../lib/data/index'
import { loadHouseholdState } from '../lib/data/state'
import { todayFor } from '../lib/derive/dates'
import { DEFAULT_DUMP_PATH, Dump } from '../lib/import/dump'
import { timezonePreflight } from '../lib/import/preflight'
import { validateDump } from '../lib/import/validate'
import { generateReport } from '../lib/reconcile/report'
import { IncompleteDumpError, TimezonePreflightError } from '../lib/errors'

/**
 * `npm run reconcile` — quickstart V3 (T067).
 *
 * **Exits non-zero on any FAIL, so the completion gate is machine-enforced**
 * (FR-009). A gate a human has to remember to check is not a gate.
 *
 * Reconciliation runs against the dump, never a live spreadsheet, and `today`
 * is pinned so the report is reproducible: `Rates!B2` is a live market lookup,
 * and unpinned, every downstream figure moves between recalculations (R7).
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

/** The dump's own extraction date, in the household zone. Never a live clock. */
const PINNED_TODAY = '2026-08-27'

const dumpPath = argValue('--dump', DEFAULT_DUMP_PATH)
const dbPath = argValue('--db', process.env.LOCAL_DB_PATH ?? '.data/local.db')
const outPath = argValue('--out', '')

const client = createLocalClient(dbPath)

try {
  const dump = Dump.fromFile(dumpPath)

  const householdIds = await listHouseholdIds(client)
  const householdId = householdIds[0]
  if (householdId === undefined) {
    console.error(
      `No household in ${dbPath}. Run \`npm run import -- --dump ${dumpPath}\` first — ` +
        `the report compares the database against the dump, so there has to be one.`,
    )
    process.exit(1)
  }

  const context = await ownerContextFor(client, householdId)
  if (context === null) {
    console.error(`Household ${householdId} has no owner membership; the database is malformed.`)
    process.exit(1)
  }

  // The reconciler runs the same preflight as the importer (FR-048): a dump
  // whose zones straddle a date boundary would reconcile today's derivations
  // against yesterday's TODAY()-dependent figures.
  timezonePreflight(dump, context)
  validateDump(dump)

  const today = argValue('--today', PINNED_TODAY)
  void todayFor // the sanctioned clock path, unused here because today is pinned

  const state = await loadHouseholdState(createRepository(client, context), { today })
  const report = generateReport(dump, state)

  if (outPath !== '') {
    writeFileSync(outPath, report.text)
    console.log(`Wrote ${outPath}`)
  } else {
    console.log(report.text)
  }

  if (!report.gateOpen || report.counts.FAIL > 0) {
    process.exit(1)
  }
} catch (error) {
  if (error instanceof IncompleteDumpError || error instanceof TimezonePreflightError) {
    console.error(`\nRefusing to reconcile.\n\n${error.message}\n`)
    process.exit(1)
  }
  throw error
} finally {
  client.raw.close()
}
