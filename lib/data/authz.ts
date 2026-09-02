import type { HouseholdContext } from './context'
import { UnauthorizedRoleError } from '../errors'

/**
 * Role enforcement (T031, research.md R8, spec FR-008).
 *
 * Called at the **top of the data-layer write functions** they guard — never
 * in route handlers — so an unguarded write is not expressible through the
 * exported surface, the same structural argument Principle IX already makes
 * for household scoping. Reads require membership only; `viewer` reads
 * everything in its household.
 */

export type WriterRole = 'owner' | 'admin' | 'member'

const WRITER_ROLES: readonly WriterRole[] = ['owner', 'admin', 'member']
const ADMIN_ROLES: readonly WriterRole[] = ['owner', 'admin']

export function assertWriter(ctx: HouseholdContext): void {
  if (!WRITER_ROLES.includes(ctx.role as WriterRole)) {
    throw new UnauthorizedRoleError(ctx.role, 'writer')
  }
}

export function assertAdmin(ctx: HouseholdContext): void {
  if (!ADMIN_ROLES.includes(ctx.role as WriterRole)) {
    throw new UnauthorizedRoleError(ctx.role, 'admin')
  }
}
