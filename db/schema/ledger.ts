import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { accounts } from './holdings'
import { rates } from './rates'
import { households, users } from './tenancy'

/**
 * Ledger (T024).
 *
 * **No `amount_egp_minor` column.** The EGP value is derived at read time from
 * `amount_minor` and the rate `rate_id` pins, which keeps it out of storage
 * (FR-012) while still freezing it at the transaction's own date (FR-042).
 * Pinning the *rate* rather than the *result* satisfies two requirements that
 * look contradictory, and it survives a later correction to rate history: the
 * link records which rate was actually used (R4).
 */
export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    occurredOn: text('occurred_on').notNull(),
    kind: text('kind').notNull(),
    category: text('category'),
    accountId: text('account_id'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    rateId: text('rate_id'),
    note: text('note'),
    /** Set on a correcting entry (FR-015). Never an in-place edit. */
    reversesId: text('reverses_id'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    transactions_household_id_unique: unique('transactions_household_id_unique').on(t.householdId, t.id),
    transactions_household_idx: index('transactions_household_idx').on(t.householdId),
    transactions_occurred_idx: index('transactions_occurred_idx').on(t.householdId, t.occurredOn),
    transactions_account_household_fk: foreignKey({
      name: 'transactions_account_household_fk',
      columns: [t.householdId, t.accountId],
      foreignColumns: [accounts.householdId, accounts.id],
    }),
    transactions_rate_household_fk: foreignKey({
      name: 'transactions_rate_household_fk',
      columns: [t.householdId, t.rateId],
      foreignColumns: [rates.householdId, rates.id],
    }),
    transactions_reverses_household_fk: foreignKey({
      name: 'transactions_reverses_household_fk',
      columns: [t.householdId, t.reversesId],
      foreignColumns: [t.householdId, t.id],
    }),
    transactions_kind_check: check('transactions_kind_check', sql`${t.kind} in ('income', 'expense', 'transfer')`),
    transactions_currency_check: check('transactions_currency_check', sql`${t.currency} in ('EGP', 'USD')`),
    /** A foreign amount without its rate is a number with no meaning (FR-047). */
    transactions_usd_needs_rate: check(
      'transactions_usd_needs_rate',
      sql`(${t.currency} = 'USD' and ${t.rateId} is not null) or ${t.currency} != 'USD'`,
    ),
    /**
     * A row may not reverse itself. This one *is* expressible as a CHECK
     * because it constrains a single row — cycles of length greater than one
     * are not, and live in the repository instead
     * (see `lib/data/corrections.ts`).
     */
    transactions_no_self_reversal: check(
      'transactions_no_self_reversal',
      sql`${t.reversesId} is null or ${t.reversesId} != ${t.id}`,
    ),
    /** A row may not be reversed twice. */
    transactions_reverses_unique: uniqueIndex('transactions_reverses_unique')
      .on(t.householdId, t.reversesId)
      .where(sql`reverses_id is not null`),
  }),
)

/**
 * `Installments!A:E` (56 rows).
 *
 * `paid_at` is a nullable timestamp rather than the sheet's `"Yes"`/`"No"`
 * string, so it records *when* a payment happened — something the sheet cannot
 * express. NULL means unpaid.
 */
export const installments = sqliteTable(
  'installments',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    planName: text('plan_name').notNull(),
    dueOn: text('due_on').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    kind: text('kind'),
    paidAt: integer('paid_at'),
    paidBy: text('paid_by').references(() => users.id),
    sortOrder: integer('sort_order').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    installments_household_id_unique: unique('installments_household_id_unique').on(t.householdId, t.id),
    installments_household_idx: index('installments_household_idx').on(t.householdId),
    installments_due_idx: index('installments_due_idx').on(t.householdId, t.dueOn),
  }),
)

/**
 * `CC Payments!H7:H10` (4 rows).
 *
 * The three nullable columns exist per the feature-002 contract and import as
 * NULL. They are not invented defaults — the sheet has no value for them, and
 * a fabricated `statement_day` would be a derived value masquerading as a fact.
 */
export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    name: text('name').notNull(),
    limitMinor: integer('limit_minor'),
    statementDay: integer('statement_day'),
    dueDay: integer('due_day'),
    sortOrder: integer('sort_order').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    cards_household_id_unique: unique('cards_household_id_unique').on(t.householdId, t.id),
    cards_household_idx: index('cards_household_idx').on(t.householdId),
  }),
)

/** `CC Payments!A2:F10` — genuinely empty today. Exists so feature 004 has
 * somewhere to write. */
export const cardPayments = sqliteTable(
  'card_payments',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    cardId: text('card_id').notNull(),
    dueOn: text('due_on').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    paidAt: integer('paid_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    card_payments_household_id_unique: unique('card_payments_household_id_unique').on(t.householdId, t.id),
    card_payments_household_idx: index('card_payments_household_idx').on(t.householdId),
    card_payments_card_household_fk: foreignKey({
      name: 'card_payments_card_household_fk',
      columns: [t.householdId, t.cardId],
      foreignColumns: [cards.householdId, cards.id],
    }),
  }),
)

/**
 * `CC Payments!I2:I4`.
 *
 * **`salary_currency` is required, and it is `USD` here.** An earlier draft
 * typed `salary_minor` as EGP piastres outright. The stored salary is 2250
 * USD, so that typing would have imported it as 22.50 EGP — a 2,000-fold error
 * in the one figure the household budgets against (FR-047).
 */
export const incomeSettings = sqliteTable(
  'income_settings',
  {
    householdId: text('household_id')
      .primaryKey()
      .references(() => households.id),
    salaryMinor: integer('salary_minor'),
    salaryCurrency: text('salary_currency').notNull(),
    payDay: integer('pay_day'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    income_settings_currency_check: check(
      'income_settings_currency_check',
      sql`${t.salaryCurrency} in ('EGP', 'USD')`,
    ),
  }),
)
