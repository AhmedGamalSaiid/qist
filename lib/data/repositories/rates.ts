import { asc, eq } from 'drizzle-orm'
import type { AppClient } from '../../../db/client'
import { rates } from '../../../db/schema/index'
import type { RateRecord } from '../../derive/types'
import type { ConvertibleClass } from '../../money/types'
import type { HouseholdContext } from '../context'

export function ratesRepository(client: AppClient, ctx: HouseholdContext) {
  return {
    /** Every rate ever recorded. Superseding never removes (FR-017, FR-038). */
    async all(): Promise<RateRecord[]> {
      const rows = await client.db
        .select()
        .from(rates)
        .where(eq(rates.householdId, ctx.householdId))
        .orderBy(asc(rates.asOf))

      return rows.map((row) => ({
        id: row.id,
        assetClass: row.assetClass as ConvertibleClass,
        rateMinor: row.rateMinor,
        scale: row.scale,
        asOf: row.asOf,
      }))
    },

    async allRows() {
      return client.db
        .select()
        .from(rates)
        .where(eq(rates.householdId, ctx.householdId))
        .orderBy(asc(rates.asOf))
    },
  }
}
