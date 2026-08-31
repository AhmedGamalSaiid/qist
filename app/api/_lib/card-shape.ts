import { cardBalances } from '../../../lib/derive/index'
import type { CardLike, LiabilityLike } from '../../../lib/derive/types'
import type { MinorUnits } from '../../../lib/money/types'

/** The DB row shape `repository.ledger.cards()` returns. */
export interface CardRow {
  readonly id: string
  readonly name: string
  readonly limitMinor: number | null
  readonly statementDay: number | null
  readonly dueDay: number | null
  readonly sortOrder: number
  readonly createdAt: number
}

function toCardLike(row: CardRow): CardLike {
  return {
    id: row.id,
    name: row.name,
    limitMinor: row.limitMinor as MinorUnits | null,
    statementDay: row.statementDay,
    dueDay: row.dueDay,
    sortOrder: row.sortOrder,
  }
}

/** The card object shape every cards route returns (contracts/http-api.md): the row plus its derived `balanceMinor`. */
export function cardResponseShape(
  row: CardRow,
  liabilities: readonly LiabilityLike[],
): CardRow & { balanceMinor: number } {
  const balance = cardBalances([toCardLike(row)], liabilities)[0]
  return { ...row, balanceMinor: balance?.balanceMinor ?? 0 }
}
