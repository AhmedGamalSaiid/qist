import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as dataLayer from '../../lib/data/index'

/**
 * T090 — the raw Drizzle client is not reachable from `lib/data/`'s public
 * exports, so an unscoped query cannot be written against the exported surface
 * (FR-022, Principle IX, R5).
 *
 * Principle IX demands the unsafe query be *inexpressible*, not merely
 * discouraged. A lint rule or a code-review convention fails the first time
 * someone is in a hurry, so the boundary is a module boundary — and a boundary
 * nothing checks is a comment.
 */

describe('data-layer surface', () => {
  it('exports no raw client and no schema tables', () => {
    const exported = Object.keys(dataLayer).sort()

    for (const forbidden of ['db', 'client', 'drizzle', 'schema', 'sqlite', 'createLocalClient', 'createD1Client']) {
      expect(exported, `lib/data exports "${forbidden}"`).not.toContain(forbidden)
    }

    // Table objects would be just as good as a client for writing an unscoped
    // query, so none of them may leak either.
    for (const name of exported) {
      const value = (dataLayer as Record<string, unknown>)[name]
      expect(
        isDrizzleTable(value),
        `lib/data exports the table object "${name}"`,
      ).toBe(false)
    }
  })

  it('exports only the scoped surface', () => {
    const exported = Object.keys(dataLayer).sort()
    expect(exported).toEqual([
      'accountBalance',
      'applyCardConsolidation',
      'assertAdmin',
      'assertWriter',
      'atomically',
      'claimMigratedHousehold',
      'createCard',
      'createRepository',
      'deriveAll',
      'householdContextFor',
      'householdsFor',
      'listHouseholdIds',
      'loadHouseholdState',
      'ownerContextFor',
      'provisionHousehold',
      'recordAudit',
      'recordCorrection',
      'setBalanceMode',
      'updateCard',
    ])
  })

  it('does not re-export db/client from lib/data/index.ts', () => {
    const source = readFileSync('lib/data/index.ts', 'utf8')
    expect(source).not.toMatch(/from\s+'\.\.\/\.\.\/db\/client/)
    expect(source).not.toMatch(/export \* from/)
  })

  it('gives no repository method a household-id parameter', () => {
    // Scoping derives from the context, never from caller-supplied input
    // (FR-021). A method that took a household id would be an unscoped query
    // wearing a scoped method's name.
    for (const file of walk('lib/data/repositories')) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/\(\s*householdId\s*:/)
      expect(source, file).not.toMatch(/householdId\s*:\s*string\s*[,)]/)
    }
  })

  it('keeps the driver imports out of the data layer', () => {
    // `db/client-local.ts` and `db/client-d1.ts` are the only files that may
    // import a driver. If `lib/data` reached for one directly, the boundary
    // would exist on paper only.
    for (const file of walk('lib/data')) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/from 'better-sqlite3'/)
      expect(source, file).not.toMatch(/from 'drizzle-orm\/better-sqlite3'/)
      expect(source, file).not.toMatch(/from 'drizzle-orm\/d1'/)
    }
  })
})

function isDrizzleTable(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  return Object.getOwnPropertySymbols(value).some((symbol) =>
    String(symbol).includes('drizzle:Name'),
  )
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (full.endsWith('.ts')) yield full
  }
}
