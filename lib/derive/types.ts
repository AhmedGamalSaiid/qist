import type { AssetClass, EgpMinor, IsoDate, MinorUnits, RateLike } from '../money/types'

/**
 * The inputs every derivation reads. These are deliberately plain shapes
 * rather than the Drizzle row types: a derivation is pure, takes explicit
 * inputs and touches no database, so it must not depend on one.
 */

export interface AccountLike {
  readonly id: string
  readonly name: string
  readonly kind: 'asset' | 'liability'
  readonly assetClass: AssetClass
  readonly isInvestment: boolean
  readonly quantityMinor: MinorUnits
  /**
   * How the balance was established (FR-024). Derivations do not read this —
   * they take the quantity as given — but the report shows it beside every
   * balance, because "67,000" means something different under each mode.
   */
  readonly balanceMode: 'stated' | 'derived'
  readonly openingQuantityMinor: MinorUnits | null
  readonly openingDate: string | null
}

export interface PropertyHoldingLike {
  readonly id: string
  readonly name: string
  readonly paidToDateMinor: EgpMinor
}

export interface LiabilityLike {
  readonly id: string
  readonly name: string
  readonly amountMinor: EgpMinor
  /** Set on a correcting entry (004). NULL for every imported row. */
  readonly reversesId: string | null
  /** Links this row to the card whose balance it states (004). NULL for
   * every imported row and for non-card liabilities. */
  readonly cardId: string | null
}

/** A card's identifying and scheduling attributes — not its balance, which
 * is derived from `liabilities` (004, `cardBalances`). */
export interface CardLike {
  readonly id: string
  readonly name: string
  readonly limitMinor: MinorUnits | null
  readonly statementDay: number | null
  readonly dueDay: number | null
  readonly sortOrder: number
}

export interface InstallmentLike {
  readonly id: string
  readonly planName: string
  readonly dueOn: IsoDate
  readonly amountMinor: EgpMinor
  readonly paidAt: number | null
}

export interface TransactionLike {
  readonly id: string
  readonly occurredOn: IsoDate
  readonly kind: 'income' | 'expense' | 'transfer'
  readonly amountMinor: MinorUnits
  readonly currency: 'EGP' | 'USD'
  readonly rateId: string | null
  readonly reversesId: string | null
}

export type RateRecord = RateLike & { readonly id: string }

/** One class's position: the native quantity and its EGP equivalent. */
export interface ClassPosition {
  readonly nativeMinor: MinorUnits
  readonly egpMinor: EgpMinor
  /**
   * Whether reaching `egpMinor` actually performed a conversion. A zero
   * quantity converts exactly, so it contributes nothing to a figure's
   * reconciliation tolerance.
   */
  readonly converted: boolean
}

export type HoldingsByClass = Readonly<Record<AssetClass, ClassPosition>>
