import { daysBetween } from '../derive/dates'
import type { IsoDate } from '../money/types'
import type { RateRecord } from '../derive/types'

/**
 * Rate age reporting (T086, FR-040).
 *
 * The age of the rate in use must be determinable wherever a converted figure
 * is shown, **and a skipped fetch must never silently reuse the previous rate
 * as though it were current**. Those are the same requirement seen from two
 * sides: if the age is visible, a stale rate cannot masquerade as a fresh one.
 */

export interface RateAge {
  readonly assetClass: string
  readonly asOf: IsoDate
  readonly ageInDays: number
  readonly stale: boolean
  readonly description: string
}

/** Beyond this, a rate is reported as stale rather than merely dated. */
export const STALE_AFTER_DAYS = 7

export function rateAge(rate: RateRecord, asOfDate: IsoDate): RateAge {
  const ageInDays = daysBetween(rate.asOf, asOfDate)
  const stale = ageInDays > STALE_AFTER_DAYS

  return {
    assetClass: rate.assetClass,
    asOf: rate.asOf,
    ageInDays,
    stale,
    // Terse, because this is appended to the note on every converted line.
    // It has to be present (FR-040) without crowding out the note itself.
    description:
      ageInDays === 0
        ? `0d (${rate.asOf})`
        : `${ageInDays}d (${rate.asOf}${stale ? ', STALE' : ''})`,
  }
}

export function rateAges(
  rates: readonly RateRecord[],
  asOfDate: IsoDate,
): Map<string, RateAge> {
  const newest = new Map<string, RateRecord>()
  for (const rate of rates) {
    if (rate.asOf > asOfDate) continue
    const current = newest.get(rate.assetClass)
    if (current === undefined || rate.asOf > current.asOf) newest.set(rate.assetClass, rate)
  }

  const out = new Map<string, RateAge>()
  for (const [assetClass, rate] of newest) out.set(assetClass, rateAge(rate, asOfDate))
  return out
}

/**
 * A one-line summary for the report's `note` column: the oldest rate in play,
 * because that is the one that limits how current any converted figure is.
 */
export function oldestRateDescription(
  rates: readonly RateRecord[],
  asOfDate: IsoDate,
): string | undefined {
  const ages = [...rateAges(rates, asOfDate).values()]
  if (ages.length === 0) return undefined
  const oldest = ages.reduce((worst, age) => (age.ageInDays > worst.ageInDays ? age : worst))
  return oldest.description
}
