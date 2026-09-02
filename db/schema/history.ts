import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { households } from './tenancy'

/**
 * Snapshots (T026) — from `History` rows 4+.
 *
 * Exempt from the derive-don't-store rule: a snapshot is a dated historical
 * fact, not a cache (Principle I, FR-012).
 *
 * **Neither net-worth column is named plain `net_worth_minor`.** D4 forbids
 * presenting either figure unqualified, and a column name is a presentation
 * the whole codebase reads. An earlier draft stored `net_worth_minor`, which
 * would have reintroduced through this table exactly the ambiguity D4 exists
 * to remove.
 *
 * `History!G` is the *excluding-installments* figure — the sheet's `B20`. The
 * including-installments figure was never recorded historically and cannot be
 * recovered: the sheet stored one number, and the installment schedule as it
 * stood on 2026-08-17 is not in the dump. It imports NULL, and the report must
 * not read that NULL as a zero.
 */
export const snapshots = sqliteTable(
  'snapshots',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    takenOn: text('taken_on').notNull(),
    liquidMinor: integer('liquid_minor').notNull(),
    investmentsMinor: integer('investments_minor').notNull(),
    propertyPaidMinor: integer('property_paid_minor').notNull(),
    shortTermLiabilitiesMinor: integer('short_term_liabilities_minor').notNull(),
    remainingInstallmentsMinor: integer('remaining_installments_minor').notNull(),
    netWorthExclInstallmentsMinor: integer('net_worth_excl_installments_minor').notNull(),
    netWorthInclInstallmentsMinor: integer('net_worth_incl_installments_minor'),
    source: text('source').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    snapshots_household_id_unique: unique('snapshots_household_id_unique').on(t.householdId, t.id),
    snapshots_household_taken_on_unique: unique('snapshots_household_taken_on_unique').on(t.householdId, t.takenOn),
    snapshots_household_idx: index('snapshots_household_idx').on(t.householdId),
    snapshots_source_check: check('snapshots_source_check', sql`${t.source} in ('imported', 'app')`),
    /** Snapshots the application takes after cutover record both figures. */
    snapshots_app_records_both: check(
      'snapshots_app_records_both',
      sql`${t.source} != 'app' or ${t.netWorthInclInstallmentsMinor} is not null`,
    ),
  }),
)
