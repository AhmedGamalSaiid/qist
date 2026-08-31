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
 * Better Auth's user model maps onto this table (research.md R1): `id`,
 * `email`, `name`, `image`, `created_at` were already Better-Auth-compatible
 * by design (003); `email_verified` and `updated_at` are the two columns
 * Better Auth requires that 003 omitted. The importer's placeholder user
 * stays `email_verified = 0` forever — it has no `auth_accounts` row and is
 * never an authentication target (FR-011).
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(sql`0`),
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
