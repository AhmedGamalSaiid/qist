import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadHouseholdState } from '../../lib/data/state'
import { importFixture, type ImportedFixture } from '../helpers/imported'

/**
 * T083 — reading the same figure twice without an intervening write returns
 * the same answer (FR-041).
 *
 * No column holds a live external lookup. This is the direct fix for
 * `Rates!B2 = GOOGLEFINANCE("CURRENCY:USDEGP")`, which re-evaluates on every
 * recalculation and moves every figure downstream of it — `Total`,
 * `Investment`, `Net Worth`, `Dashboard`, `History` row 2 and
 * `Transactions!G`.
 */

describe('reproducibility', () => {
  let fixture: ImportedFixture

  afterEach(async () => {
    await fixture?.database.dispose()
  })

  it('returns identical derived figures on two consecutive reads', async () => {
    fixture = await importFixture()

    const first = await loadHouseholdState(fixture.repository, { today: '2026-08-27' })
    const second = await loadHouseholdState(fixture.repository, { today: '2026-08-27' })

    expect(JSON.stringify(second.derived)).toBe(JSON.stringify(first.derived))
    expect(second.derived.netWorth).toEqual(first.derived.netWorth)
    expect(second.derived.installmentSummary).toEqual(first.derived.installmentSummary)
  })

  it('returns the same figures across a fresh repository construction', async () => {
    fixture = await importFixture()
    const first = await loadHouseholdState(fixture.repository, { today: '2026-08-27' })

    const { createRepository } = await import('../../lib/data/repository')
    const rebuilt = createRepository(fixture.database.client, fixture.repository.context)
    const second = await loadHouseholdState(rebuilt, { today: '2026-08-27' })

    expect(JSON.stringify(second.derived)).toBe(JSON.stringify(first.derived))
  })

  it('has no live external lookup anywhere on a read path', () => {
    // A stored formula, a fetch on read, or a network call inside a derivation
    // would each reintroduce the defect. Comments and string literals are
    // stripped first, so prose *describing* GOOGLEFINANCE does not read as an
    // invocation of it — and `source: 'fetch'`, which is a label, does not
    // read as a call.
    const forbidden = [/GOOGLEFINANCE/i, /\bfetch\s*\(/, /XMLHttpRequest/, /https?:\/\/api\./]
    const readPaths = ['lib/derive', 'lib/money', 'lib/rates', 'lib/data', 'lib/import']

    for (const root of readPaths) {
      for (const file of walk(root)) {
        const source = stripCommentsAndStrings(readFileSync(file, 'utf8'))
        for (const pattern of forbidden) {
          expect(source, `${file} matched ${pattern}`).not.toMatch(pattern)
        }
      }
    }
  })
})

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (full.endsWith('.ts')) yield full
  }
}
