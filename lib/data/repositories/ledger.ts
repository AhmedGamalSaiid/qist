import { asc, eq } from 'drizzle-orm'
import type { AppClient } from '../../../db/client'
import { cardPayments, cards, incomeSettings, installments, transactions } from '../../../db/schema/index'
import type { InstallmentLike, TransactionLike } from '../../derive/types'
import type { HouseholdContext } from '../context'

export function ledgerRepository(client: AppClient, ctx: HouseholdContext) {
  return {
    async installments(): Promise<InstallmentLike[]> {
      const rows = await client.db
        .select()
        .from(installments)
        .where(eq(installments.householdId, ctx.householdId))
        .orderBy(asc(installments.sortOrder))

      return rows.map((row) => ({
        id: row.id,
        planName: row.planName,
        dueOn: row.dueOn,
        amountMinor: row.amountMinor,
        paidAt: row.paidAt,
      }))
    },

    async transactions(): Promise<TransactionLike[]> {
      const rows = await client.db
        .select()
        .from(transactions)
        .where(eq(transactions.householdId, ctx.householdId))
        .orderBy(asc(transactions.occurredOn))

      return rows.map((row) => ({
        id: row.id,
        occurredOn: row.occurredOn,
        kind: row.kind as 'income' | 'expense' | 'transfer',
        amountMinor: row.amountMinor,
        currency: row.currency as 'EGP' | 'USD',
        rateId: row.rateId,
        reversesId: row.reversesId,
      }))
    },

    async cards() {
      return client.db
        .select()
        .from(cards)
        .where(eq(cards.householdId, ctx.householdId))
        .orderBy(asc(cards.sortOrder))
    },

    async cardPayments() {
      return client.db
        .select()
        .from(cardPayments)
        .where(eq(cardPayments.householdId, ctx.householdId))
        .orderBy(asc(cardPayments.dueOn))
    },

    async incomeSettings() {
      const rows = await client.db
        .select()
        .from(incomeSettings)
        .where(eq(incomeSettings.householdId, ctx.householdId))
        .limit(1)
      return rows[0] ?? null
    },
  }
}
