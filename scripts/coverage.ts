import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_DUMP_PATH, Dump } from '../lib/import/dump'
import {
  buildCoverageMatrix,
  COVERAGE_PATH,
  renderCoverageMatrix,
  summariseCoverage,
} from '../lib/reconcile/coverage-matrix'
import { ownedDerivations } from '../lib/reconcile/ownership'

/** `npm run coverage:generate` (T011, T012, T013). */

const dump = Dump.fromFile(DEFAULT_DUMP_PATH)
const rows = buildCoverageMatrix(dump)
const summary = summariseCoverage(dump, rows)

mkdirSync(dirname(COVERAGE_PATH), { recursive: true })
writeFileSync(COVERAGE_PATH, renderCoverageMatrix(dump, summary))

console.log(`Wrote ${COVERAGE_PATH}`)
console.log(`  formula cells        ${summary.formulaCells} / ${summary.declaredFormulas} declared`)
console.log(`  distinct shapes      ${summary.distinctShapes}`)
console.log(`  excluded shapes      ${summary.excluded}`)
console.log(`  owning derivations   ${ownedDerivations().length}  (${ownedDerivations().join(', ')})`)

if (summary.unassigned.length > 0) {
  console.error(`\n${summary.unassigned.length} range(s) have no owner:`)
  for (const row of summary.unassigned) console.error(`  ${row.key}  ${row.shape.slice(0, 90)}`)
  console.error('\nAdd an entry to lib/reconcile/ownership.ts for each.')
  process.exit(1)
}
if (summary.missingReason.length > 0) {
  console.error(`\n${summary.missingReason.length} EXCLUDED range(s) have no reason:`)
  for (const row of summary.missingReason) console.error(`  ${row.key}`)
  process.exit(1)
}
if (!summary.complete) {
  console.error('\nThe matrix does not account for every formula in the dump.')
  process.exit(1)
}
