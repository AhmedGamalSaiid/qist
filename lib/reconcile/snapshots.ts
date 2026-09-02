import type { SnapshotRow } from '../data/state'
import type { EgpMinor } from '../money/types'

/**
 * Snapshot handling (T068, FR-032, FR-033, US1 acceptance scenario 7).
 *
 * Historical snapshots are listed as **carried-over historical fact and
 * excluded from pass/fail**, rather than recomputed and compared.
 *
 * Recomputing them would be meaningless: a snapshot dated 2026-08-17 was taken
 * against holdings, rates and an installment schedule as they stood that day,
 * and none of that state is in the dump. Comparing today's derivations against
 * it would produce a large, confident-looking difference that says nothing
 * about whether the port is faithful — and would put a `FAIL` on the report
 * that no code change could clear.
 */

export interface SnapshotLine {
  readonly takenOn: string
  readonly source: string
  readonly liquidMinor: EgpMinor
  readonly investmentsMinor: EgpMinor
  readonly propertyPaidMinor: EgpMinor
  readonly shortTermLiabilitiesMinor: EgpMinor
  readonly remainingInstallmentsMinor: EgpMinor
  readonly netWorthExclInstallmentsMinor: EgpMinor
  /** Rendered as "not recorded", never as 0. */
  readonly netWorthInclInstallments: EgpMinor | 'not recorded'
  readonly disposition: string
}

export function buildSnapshotSection(snapshots: readonly SnapshotRow[]): SnapshotLine[] {
  return snapshots.map((snapshot) => ({
    takenOn: snapshot.takenOn,
    source: snapshot.source,
    liquidMinor: snapshot.liquidMinor,
    investmentsMinor: snapshot.investmentsMinor,
    propertyPaidMinor: snapshot.propertyPaidMinor,
    shortTermLiabilitiesMinor: snapshot.shortTermLiabilitiesMinor,
    remainingInstallmentsMinor: snapshot.remainingInstallmentsMinor,
    netWorthExclInstallmentsMinor: snapshot.netWorthExclInstallmentsMinor,
    // The sheet stored one net-worth number and the schedule that produced the
    // other is not in the dump, so it cannot be recovered. NULL is not a zero,
    // and printing it as one would invent 8.2 million EGP of solvency.
    netWorthInclInstallments: snapshot.netWorthInclInstallmentsMinor ?? 'not recorded',
    disposition: 'carried over as historical fact; excluded from pass/fail',
  }))
}
