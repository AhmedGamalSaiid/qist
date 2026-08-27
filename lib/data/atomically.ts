import type { AppClient, Statement } from '../../db/client'

/**
 * The one write primitive (R9a, T020).
 *
 *     atomically(client, statements)
 *
 * It takes a **pre-built array of statements** and never a callback. That is
 * the whole point, and it is not a style preference:
 *
 * D1 has no interactive transactions. A callback-style
 * `transaction(async tx => ...)` is implementable on `better-sqlite3` and not
 * on D1, so accepting a callback anywhere would let code be written that
 * passes every local test and fails only in a Worker. Taking an array makes
 * the restriction structural — there is no way to express a
 * read-then-decide-then-write cycle inside the atom, because every statement
 * must exist before the atom opens.
 *
 * What this costs: logic that needs to read before deciding what to write does
 * the read *before* calling this, and encodes its decision as a conditional
 * statement — a `WHERE` clause, or an `INSERT ... WHERE NOT EXISTS`. The
 * `reverses_id` cycle walk and the importer's upserts are both written that
 * way.
 *
 * On D1 this is `batch()`; locally it is a `better-sqlite3` transaction over
 * the same array. Both are all-or-nothing, and the same test bodies run
 * against both drivers.
 */
export async function atomically(client: AppClient, statements: Statement[]): Promise<void> {
  if (statements.length === 0) return

  const compiled = statements.map((statement) => {
    const { sql, params } = statement.toSQL()
    return { sql, params: params.map(normaliseParam) }
  })

  if (client.kind === 'local') {
    const run = client.raw.transaction(() => {
      for (const { sql, params } of compiled) {
        client.raw.prepare(sql).run(...params)
      }
    })
    run()
    return
  }

  const prepared = compiled.map(({ sql, params }) => client.raw.prepare(sql).bind(...params))
  await client.raw.batch(prepared)
}

/**
 * SQLite drivers accept a narrower set of JavaScript values than Drizzle's
 * builders emit. Normalising here rather than at every call site means a
 * boolean or a `Date` slipping into a statement fails the same way on both
 * drivers instead of only on one.
 */
function normaliseParam(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return value.getTime()
  return value
}
