import type { Config } from 'drizzle-kit'

/**
 * Drizzle Kit configuration.
 *
 * Migrations are generated into `db/migrations/` and are never hand-edited —
 * regenerate instead (R9).
 */
export default {
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  strict: true,
  verbose: true,
} satisfies Config
