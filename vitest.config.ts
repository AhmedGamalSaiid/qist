import { defineConfig } from 'vitest/config'

/**
 * Two projects over the same test bodies (R9a).
 *
 * `local` runs everything against `better-sqlite3`. `d1` re-runs the suites
 * that touch a write path against Wrangler's local D1 (Miniflare's `workerd`
 * D1, the same implementation `wrangler dev --local` binds). A single-project
 * config cannot catch a D1-only failure, and D1-only failures are the whole
 * reason `atomically` takes an array rather than a callback.
 *
 * The `d1` project deliberately does not re-run the pure derivation goldens:
 * those touch no driver, so running them twice buys nothing. R9a names the
 * isolation and import suites, and those are what it covers.
 */
const D1_SUITES = [
  'tests/atomicity/**/*.test.ts',
  'tests/isolation/**/*.test.ts',
  'tests/golden/import-*.test.ts',
  'tests/golden/arabic.test.ts',
  'tests/auth/**/*.test.ts',
  'tests/contract/**/*.test.ts',
  'tests/unit/cards.test.ts',
  'tests/unit/consolidation.test.ts',
]

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'local',
          include: ['tests/**/*.test.ts'],
          env: { DB_DRIVER: 'better-sqlite3' },
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'd1',
          include: D1_SUITES,
          env: { DB_DRIVER: 'd1' },
          testTimeout: 60_000,
        },
      },
    ],
  },
})
