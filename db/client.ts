import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import * as schema from './schema/index'

/**
 * Driver setup (T021).
 *
 * **The raw Drizzle client must not be exported past `lib/data/`.** Principle
 * IX demands that an unscoped query be inexpressible, not merely discouraged,
 * and a lint rule or a review convention fails the first time someone is in a
 * hurry. `lib/data/index.ts` re-exports the scoped repositories and nothing
 * from this file, and `tests/isolation/surface.test.ts` asserts it.
 */

export type Schema = typeof schema

/**
 * One database type for both drivers.
 *
 * `BetterSQLite3Database | DrizzleD1Database` is a union of two generic types,
 * and TypeScript cannot resolve a call like `db.select({ ... })` against it —
 * every query in the data layer would need a cast. Both drivers' clients are
 * `BaseSQLiteDatabase`, so the data layer is written against that instead and
 * the driver difference lives in `kind` and `raw`, which is where it belongs.
 *
 * The result kind is `'async'` because every call site awaits: Drizzle's query
 * builders are thenable on both drivers, and `better-sqlite3` resolving
 * immediately is not something the data layer should have to know.
 */
export type AppDatabase = BaseSQLiteDatabase<'async', unknown, Schema>

/** A minimal statement: everything Drizzle's query builders already produce. */
export interface Statement {
  toSQL(): { sql: string; params: unknown[] }
}

/**
 * Anything the local driver can execute. `better-sqlite3`'s own `Database` is
 * structurally compatible; typing it this narrowly keeps the Node-only import
 * out of the Workers build.
 */
export interface LocalSqlite {
  prepare(sql: string): { run(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] }
  exec(sql: string): unknown
  transaction<T extends (...args: never[]) => unknown>(fn: T): T
  close(): void
}

/** The D1 binding surface this code depends on. */
export interface D1Like {
  prepare(sql: string): { bind(...params: unknown[]): unknown }
  batch(statements: unknown[]): Promise<unknown>
  exec(sql: string): Promise<unknown>
}

export interface LocalClient {
  readonly kind: 'local'
  readonly db: AppDatabase
  readonly raw: LocalSqlite
}

export interface D1Client {
  readonly kind: 'd1'
  readonly db: AppDatabase
  readonly raw: D1Like
}

export type AppClient = LocalClient | D1Client

export { schema }
