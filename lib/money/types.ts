/**
 * Minor units and per-class scale (R1, T015).
 *
 * Every monetary quantity in this codebase is an integer in the smallest unit
 * of its asset class. A value typed `MinorUnits` is never a float and never a
 * string. Scale is fixed per class and never inferred from a value, so a
 * quantity can never be misread by assuming the wrong scale.
 */

/** An integer count of the smallest unit of some asset class. */
export type MinorUnits = number

/** EGP piastres specifically — the reporting currency. */
export type EgpMinor = MinorUnits

/** A calendar date, `YYYY-MM-DD`. Never an instant. */
export type IsoDate = string

export const ASSET_CLASSES = ['EGP', 'USD', 'GOLD', 'SILVER'] as const
export type AssetClass = (typeof ASSET_CLASSES)[number]

/** Classes that require a rate to reach EGP. `EGP` converts by identity. */
export const CONVERTIBLE_CLASSES = ['USD', 'GOLD', 'SILVER'] as const
export type ConvertibleClass = (typeof CONVERTIBLE_CLASSES)[number]

/**
 * Decimal places held in the minor unit of each class.
 *
 * Gold and silver are held in milligrams because the sheet records fractional
 * grams (22.50), and a 2-decimal scale would be lossy the moment a holding is
 * recorded to the milligram.
 */
export const MINOR_UNIT_SCALE: Readonly<Record<AssetClass, number>> = Object.freeze({
  EGP: 2, // piastres
  USD: 2, // cents
  GOLD: 3, // milligrams
  SILVER: 3, // milligrams
})

/**
 * Decimal places held in a rate's `rate_minor`.
 *
 * USD/EGP is quoted to four decimals by the source feed; truncating it to two
 * would shift every converted figure downstream.
 */
export const RATE_SCALE: Readonly<Record<ConvertibleClass, number>> = Object.freeze({
  USD: 4,
  GOLD: 2,
  SILVER: 2,
})

/** The scale of the reporting currency. Conversions always land here. */
export const EGP_SCALE = MINOR_UNIT_SCALE.EGP

export function isAssetClass(value: unknown): value is AssetClass {
  return typeof value === 'string' && (ASSET_CLASSES as readonly string[]).includes(value)
}

export function isConvertibleClass(value: unknown): value is ConvertibleClass {
  return typeof value === 'string' && (CONVERTIBLE_CLASSES as readonly string[]).includes(value)
}

/** A dated rate record, as stored. `scale` travels with the value by design. */
export interface RateLike {
  readonly id?: string
  readonly assetClass: ConvertibleClass
  readonly rateMinor: MinorUnits
  readonly scale: number
  readonly asOf: IsoDate
}
