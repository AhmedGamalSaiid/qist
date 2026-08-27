import { readFileSync } from 'node:fs'
import { DEFAULT_DUMP_PATH, Dump } from '../lib/import/dump'
import {
  buildCoverageMatrix,
  COVERAGE_PATH,
  renderCoverageMatrix,
  summariseCoverage,
} from '../lib/reconcile/coverage-matrix'

/**
 * `npm run coverage:check` — quickstart V8 (T014).
 *
 * Regenerates the matrix from the dump, diffs it against the committed file,
 * and fails if `sum(count)` does not equal the dump's own formula total —
 * counted from the dump, not copied from any document.
 *
 * **This is what makes the computation count a measured number** rather than
 * an assertion. A drifted matrix means a formula range has no owner and no
 * test.
 */

const dump = Dump.fromFile(DEFAULT_DUMP_PATH)
const summary = summariseCoverage(dump, buildCoverageMatrix(dump))
const regenerated = renderCoverageMatrix(dump, summary)

let failed = false

if (summary.formulaCells !== summary.declaredFormulas) {
  console.error(
    `Coverage is incomplete: the matrix accounts for ${summary.formulaCells} formula cells ` +
      `but the dump declares ${summary.declaredFormulas}.`,
  )
  failed = true
}

if (summary.unassigned.length > 0) {
  console.error(`\n${summary.unassigned.length} formula range(s) have no owning derivation:`)
  for (const row of summary.unassigned) console.error(`  ${row.key}`)
  console.error('A range with no owner has no test. Add it to lib/reconcile/ownership.ts.')
  failed = true
}

if (summary.missingReason.length > 0) {
  console.error(`\n${summary.missingReason.length} EXCLUDED range(s) carry no reason:`)
  for (const row of summary.missingReason) console.error(`  ${row.key}`)
  failed = true
}

let committed: string | null = null
try {
  committed = readFileSync(COVERAGE_PATH, 'utf8')
} catch {
  console.error(`\n${COVERAGE_PATH} is missing. Run \`npm run coverage:generate\` and commit it.`)
  failed = true
}

if (committed !== null && committed !== regenerated) {
  console.error(`\n${COVERAGE_PATH} differs from the matrix regenerated out of the dump.`)
  for (const line of firstDifference(committed, regenerated)) console.error(line)
  console.error('\nRun `npm run coverage:generate` and commit the result.')
  failed = true
}

if (failed) process.exit(1)

console.log(
  `Coverage OK: ${summary.formulaCells}/${summary.declaredFormulas} formula cells across ` +
    `${summary.distinctShapes} distinct shapes (${summary.excluded} excluded with a reason).`,
)

function firstDifference(a: string, b: string): string[] {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const out: string[] = []
  for (let i = 0; i < Math.max(aLines.length, bLines.length); i += 1) {
    if (aLines[i] === bLines[i]) continue
    out.push(`  line ${i + 1}:`)
    out.push(`    committed:   ${aLines[i] ?? '(absent)'}`)
    out.push(`    regenerated: ${bLines[i] ?? '(absent)'}`)
    if (out.length > 12) break
  }
  return out
}
