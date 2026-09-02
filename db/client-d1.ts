import { drizzle } from 'drizzle-orm/d1'
import type { AppDatabase, D1Client, D1Like } from './client'
import * as schema from './schema/index'

/** Wraps a D1 binding. The binding itself comes from the Worker environment. */
export function createD1Client(binding: unknown): D1Client {
  return {
    kind: 'd1',
    db: drizzle(binding as never, { schema }) as unknown as AppDatabase,
    raw: binding as D1Like,
  }
}
