import type { AppClient } from '../../db/client'
import type { HouseholdContext } from './context'
import { holdingsRepository } from './repositories/holdings'
import { ledgerRepository } from './repositories/ledger'
import { ratesRepository } from './repositories/rates'
import { historyRepository } from './repositories/history'

/**
 * The scoped repository surface (T091, R5, Principle IX).
 *
 * Constructed from a household context and nothing else. Every query it builds
 * injects the `household_id` predicate in the data-access layer rather than
 * relying on each handler to remember, and no method on it accepts a household
 * id — so an unscoped query is not merely discouraged, it is unwritable
 * against this surface (FR-022).
 *
 * The raw Drizzle client is not reachable from here or from `lib/data/index.ts`.
 */
export interface Repository {
  readonly context: HouseholdContext
  readonly holdings: ReturnType<typeof holdingsRepository>
  readonly ledger: ReturnType<typeof ledgerRepository>
  readonly rates: ReturnType<typeof ratesRepository>
  readonly history: ReturnType<typeof historyRepository>
}

export function createRepository(client: AppClient, context: HouseholdContext): Repository {
  return {
    context,
    holdings: holdingsRepository(client, context),
    ledger: ledgerRepository(client, context),
    rates: ratesRepository(client, context),
    history: historyRepository(client, context),
  }
}
