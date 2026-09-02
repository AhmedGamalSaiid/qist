import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { households, users } from './tenancy'

/**
 * Rates (T025).
 *
 * Append-only: recording a rate inserts, never updates (FR-038). No column may
 * hold a live external lookup evaluated at read time (FR-041) — this table is
 * the direct fix for `Rates!B2`, which is `=GOOGLEFINANCE("CURRENCY:USDEGP")`
 * and therefore moves every downstream figure between one recalculation and
 * the next.
 *
 * `scale` is stored rather than inferred so a rate can never be misread: USD
 * is quoted to four decimals and the metals to two, and a 50.2554 read at
 * scale 2 is a 100-fold error in every converted figure.
 */
export const rates = sqliteTable(
  'rates',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    assetClass: text('asset_class').notNull(),
    rateMinor: integer('rate_minor').notNull(),
    scale: integer('scale').notNull(),
    /** Effective from this date forward until superseded (R3). */
    asOf: text('as_of').notNull(),
    source: text('source').notNull(),
    /** NULL when `source = 'fetch'` — the fetch is itself the actor (FR-039). */
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    rates_household_id_unique: unique('rates_household_id_unique').on(t.householdId, t.id),
    rates_household_class_asof_unique: unique('rates_household_class_asof_unique').on(t.householdId, t.assetClass, t.asOf),
    rates_household_idx: index('rates_household_idx').on(t.householdId),
    rates_lookup_idx: index('rates_lookup_idx').on(t.householdId, t.assetClass, t.asOf),
    rates_class_check: check('rates_class_check', sql`${t.assetClass} in ('USD', 'GOLD', 'SILVER')`),
    rates_source_check: check('rates_source_check', sql`${t.source} in ('manual', 'fetch', 'imported')`),
    rates_fetch_actor_check: check(
      'rates_fetch_actor_check',
      sql`(${t.source} = 'fetch' and ${t.createdBy} is null) or (${t.source} != 'fetch')`,
    ),
  }),
)
