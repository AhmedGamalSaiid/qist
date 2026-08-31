import type { EgpMinor } from '../money/types'
import { nonReversed } from './totals'
import type { CardLike, LiabilityLike } from './types'

/**
 * A card's balance, derived — never stored (004, research.md R6).
 *
 * The sum of the card's non-reversed linked `liabilities` rows. A card with
 * no linked rows (every imported card before the D7 consolidation) has
 * balance 0 — cards themselves never carry a balance column.
 */
export interface CardBalance {
  readonly cardId: string
  readonly balanceMinor: EgpMinor
}

export function cardBalances(
  cards: readonly CardLike[],
  liabilities: readonly LiabilityLike[],
): CardBalance[] {
  const counted = nonReversed(liabilities)

  return cards.map((card) => ({
    cardId: card.id,
    balanceMinor: counted
      .filter((l) => l.cardId === card.id)
      .reduce((sum, l) => sum + l.amountMinor, 0),
  }))
}
