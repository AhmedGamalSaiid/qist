import { asc, eq } from 'drizzle-orm'
import type { AppClient } from '../../../db/client'
import { auditLog, snapshots } from '../../../db/schema/index'
import type { HouseholdContext } from '../context'

export function historyRepository(client: AppClient, ctx: HouseholdContext) {
  return {
    async snapshots() {
      return client.db
        .select()
        .from(snapshots)
        .where(eq(snapshots.householdId, ctx.householdId))
        .orderBy(asc(snapshots.takenOn))
    },

    /** Append-only. There is deliberately no update or delete here (FR-013). */
    async auditEntries() {
      return client.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.householdId, ctx.householdId))
        .orderBy(asc(auditLog.at))
    },
  }
}
