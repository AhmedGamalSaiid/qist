import Decimal from 'decimal.js'
import { MINOR_UNIT_SCALE, type AssetClass, type MinorUnits } from './types'

/**
 * Half-up rounding to an integer minor unit (R2, T016).
 *
 * Half-up here means *away from zero* on a tie, which matters because
 * `Net Worth!B19` is negative: banker's rounding does not reproduce the
 * sheet's displayed values, and truncation would drift a piastre per
 * conversion in one direction.
 *
 * Rounding is applied at each conversion and never deferred — carrying extra
 * internal precision and rounding once at the end would reproduce the
 * spreadsheet's float chain, and make stored values differ from reported ones.
 */
export function roundHalfUp(value: Decimal.Value): MinorUnits {
  return new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
}

/**
 * Convert a decimal quantity as the sheet records it into that class's minor
 * unit. The input is the raw sheet number, which is the one place a float
 * legitimately enters this system; it leaves as an integer and never returns.
 */
export function toMinor(value: Decimal.Value, assetClass: AssetClass): MinorUnits {
  const scale = MINOR_UNIT_SCALE[assetClass]
  return roundHalfUp(new Decimal(value).times(Decimal.pow(10, scale)))
}

/**
 * Render a minor-unit integer as a decimal string in its class's major unit.
 * Presentation only — never fed back into arithmetic.
 */
export function formatMajor(minor: MinorUnits, assetClass: AssetClass): string {
  const scale = MINOR_UNIT_SCALE[assetClass]
  return new Decimal(minor).times(Decimal.pow(10, -scale)).toFixed(scale)
}

/**
 * Scale a decimal value by an explicit number of places.
 *
 * Rates carry their own scale rather than their asset class's, so they cannot
 * go through `toMinor`: USD/EGP stored at scale 2 instead of 4 is a 100-fold
 * error in every converted figure downstream.
 */
export function toMinorAtScale(value: Decimal.Value, scale: number): MinorUnits {
  return roundHalfUp(new Decimal(value).times(Decimal.pow(10, scale)))
}
