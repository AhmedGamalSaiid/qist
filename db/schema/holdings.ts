import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { households } from './tenancy'

/**
 * Holdings (T023).
 *
 * `kind` exists because `asset_class` alone was not enough. The `Data` tab's
 * class column is a dropdown whose permitted values are `EGP`, `USD`, `Gold`,
 * `Silver` **and `Liability`**, and two of the 17 rows use the last one
 * (`ADIB C.C` at 600, `HSBC C.C` at 0). Constraining `asset_class` to the four
 * asset classes would have rejected both rows and made a faithful import of
 * "17 accounts" impossible.
 *
 * `Liability` is not a fifth asset class — it is a different *kind* of account
 * that happens to share the dropdown. Modelling it as `kind` is what lets
 * `holdingsByClass` exclude these rows by a deliberate filter rather than by
 * relying on a class string failing to match a SUMIFS (D7, FR-045).
 */
export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    /** May be Arabic; preserved byte-exact through import and reporting (FR-004). */
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    assetClass: text('asset_class').notNull(),
    isInvestment: integer('is_investment').notNull(),
    balanceMode: text('balance_mode').notNull(),
    quantityMinor: integer('quantity_minor'),
    openingQuantityMinor: integer('opening_quantity_minor'),
    openingDate: text('opening_date'),
    /** The informational date from `Data!E`. Not a ledger date. */
    asOf: text('as_of'),
    sortOrder: integer('sort_order').notNull(),
    /** Soft delete. History is never removed. */
    archivedAt: integer('archived_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    accounts_household_id_unique: unique('accounts_household_id_unique').on(t.householdId, t.id),
    accounts_household_idx: index('accounts_household_idx').on(t.householdId),
    accounts_kind_check: check('accounts_kind_check', sql`${t.kind} in ('asset', 'liability')`),
    accounts_class_check: check('accounts_class_check', sql`${t.assetClass} in ('EGP', 'USD', 'GOLD', 'SILVER')`),
    accounts_investment_check: check('accounts_investment_check', sql`${t.isInvestment} in (0, 1)`),
    accounts_balance_mode_check: check('accounts_balance_mode_check', sql`${t.balanceMode} in ('stated', 'derived')`),
    /**
     * Makes an inconsistent account unrepresentable rather than merely
     * invalid: a `stated` account has a quantity and no opening pair, and a
     * `derived` one has the opening pair and no stated quantity (FR-024-FR-026).
     */
    accounts_balance_mode_consistency: check(
      'accounts_balance_mode_consistency',
      sql`(
        (${t.balanceMode} = 'stated'
          and ${t.quantityMinor} is not null
          and ${t.openingQuantityMinor} is null
          and ${t.openingDate} is null)
        or
        (${t.balanceMode} = 'derived'
          and ${t.quantityMinor} is null
          and ${t.openingQuantityMinor} is not null
          and ${t.openingDate} is not null)
      )`,
    ),
  }),
)

/**
 * `Net Worth!B9:B11`. These are **assets** — `B12` sums `B4:B11`, which
 * includes them. Three rows, hand-entered, the only yellow cells on that tab.
 */
export const propertyHoldings = sqliteTable(
  'property_holdings',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    name: text('name').notNull(),
    paidToDateMinor: integer('paid_to_date_minor').notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    property_holdings_household_id_unique: unique('property_holdings_household_id_unique').on(t.householdId, t.id),
    property_holdings_household_idx: index('property_holdings_household_idx').on(t.householdId),
  }),
)

/**
 * `Total!I4:J10` — short-term liabilities. Property installments are **not**
 * here; they live in `installments`, and that distinction is exactly what
 * separates `Net Worth!B15` from `B16`.
 */
export const liabilities = sqliteTable(
  'liabilities',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    /** May be Arabic — `فرش` at 60,000.00 EGP (`Total!J9`) is a real row. */
    name: text('name').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    sortOrder: integer('sort_order').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    liabilities_household_id_unique: unique('liabilities_household_id_unique').on(t.householdId, t.id),
    liabilities_household_idx: index('liabilities_household_idx').on(t.householdId),
  }),
)
