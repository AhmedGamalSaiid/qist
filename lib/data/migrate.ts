import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AppClient } from '../../db/client'

/**
 * Applies the generated migrations to either driver.
 *
 * Generated migrations are never hand-edited — regenerate instead (R9). This
 * reader exists so the same DDL reaches `better-sqlite3` and Wrangler's local
 * D1 from one source: a schema that drifts between drivers would make the
 * dual-driver suites meaningless.
 */
export const MIGRATIONS_DIR = 'db/migrations'

export function migrationStatements(dir = MIGRATIONS_DIR): string[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const statements: string[] = []
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8')
    for (const part of sql.split('--> statement-breakpoint')) {
      const trimmed = part.trim()
      if (trimmed.length > 0) statements.push(trimmed)
    }
  }
  return statements
}

interface D1Runnable {
  prepare(sql: string): { run(): Promise<unknown> }
}

export async function applyMigrations(client: AppClient, dir = MIGRATIONS_DIR): Promise<void> {
  const statements = migrationStatements(dir)

  if (client.kind === 'local') {
    for (const statement of statements) {
      client.raw.exec(statement)
    }
    return
  }

  // D1's `exec()` cannot take a multi-line statement, and DDL is inherently
  // multi-line, so each statement is prepared and run on its own.
  const d1 = client.raw as unknown as D1Runnable
  for (const statement of statements) {
    await d1.prepare(statement).run()
  }
}
