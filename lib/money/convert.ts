import Decimal from 'decimal.js'
import { roundHalfUp } from './round'
import {
  EGP_SCALE,
  MINOR_UNIT_SCALE,
  type AssetClass,
  type EgpMinor,
  type MinorUnits,
  type RateLike,
} from './types'

/**
 * Convert one holding to EGP piastres (T017).
 *
 * `EGP -> EGP` is identity and needs no rate. Every other class needs the rate
 * in force on the relevant date; supplying `null` for a convertible class is a
 * programming error, not a missing rate — `rateAsOf` is what raises
 * `MissingRateError`, and it does so before this function is reached.
 *
 * The arithmetic is:
 *
 *   egpMinor = round_half_up( quantityMinor * rateMinor * 10^(2 - qScale - rScale) )
 *
 * carried out in `decimal.js` throughout. Principle II forbids float math on
 * any monetary path, and `lint:money` (T018) checks that this file routes rate
 * multiplication through the decimal library rather than merely asserting it.
 */
export function convert(
  quantityMinor: MinorUnits,
  fromClass: AssetClass,
  rate: RateLike | null,
): EgpMinor {
  if (fromClass === 'EGP') return quantityMinor

  if (rate === null) {
    throw new TypeError(
      `convert() was called for ${fromClass} with no rate. ` +
        `Resolve the rate with rateAsOf() first so a genuinely missing rate raises MissingRateError.`,
    )
  }
  if (rate.assetClass !== fromClass) {
    throw new TypeError(
      `convert() was given a ${rate.assetClass} rate for a ${fromClass} quantity.`,
    )
  }

  const exponent = EGP_SCALE - MINOR_UNIT_SCALE[fromClass] - rate.scale
  const product = new Decimal(quantityMinor)
    .times(new Decimal(rate.rateMinor))
    .times(Decimal.pow(10, exponent))

  return roundHalfUp(product)
}

/**
 * Whether converting this quantity actually performs a conversion.
 *
 * A zero quantity converts exactly, so it contributes nothing to a figure's
 * reconciliation tolerance. The report counts conversions that *occurred*, not
 * conversion terms present in the formula (see contracts/reconciliation.md) —
 * counting terms would inflate the allowance and let a real error hide in it.
 */
export function isRealConversion(quantityMinor: MinorUnits, fromClass: AssetClass): boolean {
  return fromClass !== 'EGP' && quantityMinor !== 0
}
