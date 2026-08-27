/**
 * The public surface of the data layer (T093, Principle IX).
 *
 * **`db/client.ts` is deliberately not re-exported.** The raw Drizzle client
 * is unreachable from here, so an unscoped query cannot be written against
 * what this module exports (FR-022). `tests/isolation/surface.test.ts` asserts
 * it, because a boundary nothing checks is a comment.
 */
export type { HouseholdContext, Identity } from './context'
export { householdContextFor, householdsFor, ownerContextFor, listHouseholdIds } from './context'
export { createRepository, type Repository } from './repository'
export { loadHouseholdState, deriveAll, type HouseholdState } from './state'
export { atomically } from './atomically'
export { recordCorrection } from './corrections'
export { recordAudit } from './audit'
export { setBalanceMode, accountBalance } from './accounts'
