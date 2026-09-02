import { MissingRateError } from '../errors'
import type { ConvertibleClass, IsoDate, RateLike } from '../money/types'

/**
 * Rate lookup by date (R3, T019).
 *
 * A rate applies from its `as_of` date forward until superseded. Converting on
 * date *D* selects the newest rate whose `as_of` is on or before *D*.
 *
 * If none exists, this throws. It never substitutes zero — a silent zero would
 * under-report net worth with no visible symptom (FR-019) — and it never
 * reaches forward to a later rate, because reaching forward would value a 2024
 * transaction at a 2026 rate, which is exactly the defect D6 exists to correct
 * (FR-043).
 */
export function rateAsOf<T extends RateLike>(
  rates: readonly T[],
  assetClass: ConvertibleClass,
  onDate: IsoDate,
): T {
  let best: T | undefined
  let earliest: IsoDate | undefined

  for (const rate of rates) {
    if (rate.assetClass !== assetClass) continue
    if (earliest === undefined || rate.asOf < earliest) earliest = rate.asOf
    if (rate.asOf > onDate) continue
    if (best === undefined || rate.asOf > best.asOf) best = rate
  }

  if (best === undefined) {
    throw new MissingRateError(assetClass, onDate, earliest ?? null)
  }
  return best
}

/**
 * Every rate recorded for a class, newest first. Superseding a rate never
 * removes it (FR-017, FR-038), so this is a history rather than a current
 * value with an audit trail bolted on.
 */
export function rateHistory<T extends RateLike>(
  rates: readonly T[],
  assetClass: ConvertibleClass,
): T[] {
  return rates.filter((r) => r.assetClass === assetClass).sort((a, b) => (a.asOf < b.asOf ? 1 : -1))
}
