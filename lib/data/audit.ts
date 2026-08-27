import type { Statement } from '../../db/client'
import type { AppClient } from '../../db/client'
import { auditLog } from '../../db/schema/index'
import type { HouseholdContext } from './context'

/**
 * Audit logging (T077, Principle II, FR-013).
 *
 * This builds a **statement**, it does not execute one. The audit entry is
 * composed into the same `atomically` batch as the write it records — an audit
 * entry that can be committed separately from its write is not a record of it,
 * it is a note that happens to be nearby.
 *
 * Append-only. There is deliberately no update or delete function in this file.
 */

export type AuditAction = 'create' | 'update' | 'archive' | 'import'

export interface AuditEntry {
  readonly id: string
  readonly action: AuditAction
  readonly entity: string
  readonly entityId: string
  readonly before?: unknown
  readonly after?: unknown
  readonly at: number
  /** `system` covers the automated rate fetch, which has no user (FR-039). */
  readonly actorKind?: 'user' | 'system'
}

export function recordAudit(
  client: AppClient,
  ctx: HouseholdContext,
  entry: AuditEntry,
): Statement {
  const actorKind = entry.actorKind ?? 'user'
  return client.db.insert(auditLog).values({
    id: entry.id,
    householdId: ctx.householdId,
    actorId: actorKind === 'system' ? null : ctx.userId,
    actorKind,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    beforeJson: entry.before === undefined ? null : JSON.stringify(entry.before),
    afterJson: entry.after === undefined ? null : JSON.stringify(entry.after),
    at: entry.at,
  }) as unknown as Statement
}
