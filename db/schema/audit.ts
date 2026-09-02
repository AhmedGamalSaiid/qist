import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { households, users } from './tenancy'

/**
 * Audit log (T027, Principle II, FR-013).
 *
 * Append-only: no update or delete path exists anywhere in `lib/data/`.
 * `actor_kind = 'system'` covers the automated rate fetch, which has no user
 * to attribute to and must still be attributable (FR-039).
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    actorId: text('actor_id').references(() => users.id),
    actorKind: text('actor_kind').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    /** When it happened. Required — an audit entry without a time is a note. */
    at: integer('at').notNull(),
  },
  (t) => ({
    audit_log_household_id_unique: unique('audit_log_household_id_unique').on(t.householdId, t.id),
    audit_log_household_idx: index('audit_log_household_idx').on(t.householdId),
    audit_log_entity_idx: index('audit_log_entity_idx').on(t.householdId, t.entity, t.entityId),
    audit_log_actor_kind_check: check('audit_log_actor_kind_check', sql`${t.actorKind} in ('user', 'system')`),
    audit_log_action_check: check('audit_log_action_check', sql`${t.action} in ('create', 'update', 'archive', 'import')`),
    audit_log_system_actor_check: check(
      'audit_log_system_actor_check',
      sql`(${t.actorKind} = 'system' and ${t.actorId} is null) or ${t.actorKind} = 'user'`,
    ),
  }),
)
