import { and, asc, eq, isNull } from 'drizzle-orm'
import type { AppClient } from '../../../db/client'
import { accounts, liabilities, propertyHoldings } from '../../../db/schema/index'
import type { AssetClass } from '../../money/types'
import type { AccountLike, LiabilityLike, PropertyHoldingLike } from '../../derive/types'
import type { HouseholdContext } from '../context'

/**
 * Every query here injects the household predicate in the data-access layer,
 * not by handler discipline (Principle IX). No method takes a household id;
 * the only one available is the context's.
 */
export function holdingsRepository(client: AppClient, ctx: HouseholdContext) {
  const scope = eq(accounts.householdId, ctx.householdId)

  return {
    async accounts(): Promise<AccountLike[]> {
      const rows = await client.db
        .select()
        .from(accounts)
        .where(and(scope, isNull(accounts.archivedAt)))
        .orderBy(asc(accounts.sortOrder))

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind as 'asset' | 'liability',
        assetClass: row.assetClass as AssetClass,
        isInvestment: row.isInvestment === 1,
        // A `derived` account has no stated quantity; its balance is opening
        // plus net of entries since, computed in `lib/data/accounts.ts`.
        quantityMinor: row.quantityMinor ?? row.openingQuantityMinor ?? 0,
        balanceMode: row.balanceMode as 'stated' | 'derived',
        openingQuantityMinor: row.openingQuantityMinor,
        openingDate: row.openingDate,
      }))
    },

    /** Including archived rows — for the audit and reconciliation paths. */
    async allAccountRows() {
      return client.db
        .select()
        .from(accounts)
        .where(scope)
        .orderBy(asc(accounts.sortOrder))
    },

    async propertyHoldings(): Promise<PropertyHoldingLike[]> {
      const rows = await client.db
        .select()
        .from(propertyHoldings)
        .where(eq(propertyHoldings.householdId, ctx.householdId))
        .orderBy(asc(propertyHoldings.sortOrder))

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        paidToDateMinor: row.paidToDateMinor,
      }))
    },

    async liabilities(): Promise<LiabilityLike[]> {
      const rows = await client.db
        .select()
        .from(liabilities)
        .where(eq(liabilities.householdId, ctx.householdId))
        .orderBy(asc(liabilities.sortOrder))

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        amountMinor: row.amountMinor,
      }))
    },
  }
}
