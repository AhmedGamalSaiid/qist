import { toMinor } from '../money/round'
import type { IsoDate, MinorUnits } from '../money/types'
import type { Dump } from './dump'
import { derivedId } from './ids'

/**
 * `History` -> snapshots (T058).
 *
 * **Rows 2 and 3 are excluded.** Row 2 is a live formula mirror of the
 * `Net Worth` tab — `=TODAY()`, `=SUM('Net Worth'!B4:B7)` and so on — not a
 * snapshot. Importing it would persist a derived value (FR-012) and would make
 * the row count 2 where it should be 1. Row 3 is the literal `SNAPSHOTS ↓`
 * separator. Exactly one genuine snapshot exists, dated 2026-08-17.
 *
 * `History!G` is the *excluding-installments* figure — the sheet's `B20` — so
 * it imports into `net_worth_excl_installments_minor`. The
 * including-installments figure was never recorded historically and cannot be
 * recovered: the sheet stored one number, and the installment schedule as it
 * stood on 2026-08-17 is not in the dump. It imports NULL, and the report must
 * not read that NULL as a zero.
 */

export interface MappedSnapshot {
  id: string
  householdId: string
  takenOn: IsoDate
  liquidMinor: MinorUnits
  investmentsMinor: MinorUnits
  propertyPaidMinor: MinorUnits
  shortTermLiabilitiesMinor: MinorUnits
  remainingInstallmentsMinor: MinorUnits
  netWorthExclInstallmentsMinor: MinorUnits
  netWorthInclInstallmentsMinor: null
  source: 'imported'
  createdAt: number
}

/** The first row that holds a genuine snapshot. Rows 2-3 are excluded above. */
export const FIRST_SNAPSHOT_ROW = 4

export function mapSnapshots(
  dump: Dump,
  householdId: string,
  createdAt: number,
): MappedSnapshot[] {
  const sheet = dump.sheet('History')
  const out: MappedSnapshot[] = []

  for (let row = FIRST_SNAPSHOT_ROW; row <= sheet.maxRow(); row += 1) {
    const takenOn = sheet.dateAt(`A${row}`, dump.sourceTimeZone)
    if (takenOn === undefined) continue

    out.push({
      id: derivedId(householdId, 'snapshots', takenOn),
      householdId,
      takenOn,
      liquidMinor: toMinor(sheet.numberAt(`B${row}`) ?? 0, 'EGP'),
      investmentsMinor: toMinor(sheet.numberAt(`C${row}`) ?? 0, 'EGP'),
      propertyPaidMinor: toMinor(sheet.numberAt(`D${row}`) ?? 0, 'EGP'),
      shortTermLiabilitiesMinor: toMinor(sheet.numberAt(`E${row}`) ?? 0, 'EGP'),
      remainingInstallmentsMinor: toMinor(sheet.numberAt(`F${row}`) ?? 0, 'EGP'),
      netWorthExclInstallmentsMinor: toMinor(sheet.numberAt(`G${row}`) ?? 0, 'EGP'),
      netWorthInclInstallmentsMinor: null,
      source: 'imported',
      createdAt,
    })
  }

  return out
}
