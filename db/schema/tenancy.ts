import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

/**
 * Tenancy (T022).
 *
 * `households.timezone` is the single canonical zone for every date-dependent
 * calculation (FR-034, R8). It is configuration, not a constant compiled into
 * the derivations: a preflight that checks against a hardcoded
 * `'Africa/Cairo'` stops being a check the moment the household moves.
 */
export const households = sqliteTable('households', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseCurrency: text('base_currency').notNull().default('EGP'),
  timezone: text('timezone').notNull().default('Africa/Cairo'),
  createdAt: integer('created_at').notNull(),
})

/**
 * Auth flows are feature 004. This table exists so `audit_log` and
 * `memberships` have something real to reference — an audit entry whose actor
 * is an unvalidated string is not a record of who did anything.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  createdAt: integer('created_at').notNull(),
})

export const memberships = sqliteTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(),
    joinedAt: integer('joined_at').notNull(),
  },
  (t) => ({
    memberships_household_id_unique: unique('memberships_household_id_unique').on(t.householdId, t.id),
    memberships_household_user_unique: unique('memberships_household_user_unique').on(t.householdId, t.userId),
    memberships_household_idx: index('memberships_household_idx').on(t.householdId),
    memberships_role_check: check('memberships_role_check', sql`${t.role} in ('owner', 'admin', 'member', 'viewer')`),
  }),
)

export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    email: text('email').notNull(),
    role: text('role').notNull(),
    // The token itself is never stored — only a hash of it.
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id),
    acceptedAt: integer('accepted_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    invitations_household_id_unique: unique('invitations_household_id_unique').on(t.householdId, t.id),
    invitations_household_idx: index('invitations_household_idx').on(t.householdId),
    // `owner` is never invitable: ownership is transferred deliberately, never
    // granted by an emailed link.
    invitations_role_check: check(
      'invitations_role_check',
      sql`${t.role} in ('admin', 'member', 'viewer')`,
    ),
  }),
)
