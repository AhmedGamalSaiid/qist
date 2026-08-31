import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { users } from './tenancy'

/**
 * The identity plane (T006, research.md R1).
 *
 * Better Auth's own tables, `auth_`-prefixed so its default `account` model
 * never collides with the domain's financial `accounts` table. **No
 * `household_id` anywhere here** — these rows are keyed by user, and
 * household scope is derived from them at context construction, never
 * stored on them (Constitution Principle IX, plan.md Constitution Check).
 *
 * Column lists were verified against the installed `better-auth@1.7.2`
 * package's own table builder
 * (`node_modules/better-auth/node_modules/@better-auth/core/dist/db/get-tables.mjs`),
 * per R1's caveat that the mapping is checked against the installed version
 * rather than assumed. One divergence from the original design sketch: this
 * version's `account` model carries an `issuer` column in addition to
 * `provider_id`, with its uniqueness constraint on `(issuer, account_id)`
 * rather than `(provider_id, account_id)` — folded in here rather than
 * papered over (Constitution Principle VIII).
 *
 * Date-typed fields use Drizzle's `timestamp_ms` integer mode (matching what
 * `@better-auth/drizzle-adapter`'s own schema generator emits for SQLite) so
 * Better Auth's internal code — which compares `session.expiresAt` etc. as
 * JS `Date` objects — round-trips correctly through this schema. The
 * storage is still an INTEGER epoch-ms column either way.
 */

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    auth_sessions_user_idx: index('auth_sessions_user_idx').on(t.userId),
    auth_sessions_token_idx: index('auth_sessions_token_idx').on(t.token),
  }),
)

/**
 * The OAuth provider link (Google). `access_token` / `refresh_token` /
 * `id_token` hold NULL in every row — sign-in never requests offline access,
 * and a database hook (`lib/auth/config.ts`) strips them before this row
 * persists (spec FR-001, research.md R2). The columns exist only because
 * Better Auth's account model requires them.
 */
export const authAccounts = sqliteTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    issuer: text('issuer').notNull(),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    auth_accounts_issuer_account_unique: unique('auth_accounts_issuer_account_unique').on(
      t.issuer,
      t.accountId,
    ),
    auth_accounts_user_idx: index('auth_accounts_user_idx').on(t.userId),
  }),
)

export const authVerifications = sqliteTable(
  'auth_verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    auth_verifications_identifier_idx: index('auth_verifications_identifier_idx').on(t.identifier),
  }),
)
