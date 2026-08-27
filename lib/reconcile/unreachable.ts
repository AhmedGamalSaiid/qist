import type { EgpMinor } from '../money/types'

/**
 * Unreachable values (T064, D7, FR-044, FR-045).
 *
 * Distinct from a divergence: a value the source **stores but no formula
 * reads**. It changes no figure, so it has no verdict — but discarding it
 * silently would lose data the owner entered.
 *
 * Today this is `Data!D13` at 600 EGP and `Data!D14` at 0. Both are
 * `Liability`-kind accounts, and the sheet's SUMIFS formulas match on the
 * literal asset-class string, so no formula on any tab reads either cell.
 *
 * **Zeros are listed too**, so an empty section is unambiguous: an omitted
 * zero would make "no unreachable values" and "one unreachable value that
 * happens to be zero" look identical.
 *
 * An unreachable value is not a `FAIL`. An unreachable value *absent from this
 * section* is, because it means the importer dropped it.
 */

export interface UnreachableValue {
  readonly sourceRef: string
  readonly label: string
  readonly storedMinor: EgpMinor
  readonly readBy: string
  readonly disposition: string
}

export interface UnreachableInput {
  readonly sourceRef: string
  readonly name: string
  readonly kind: 'asset' | 'liability'
  readonly storedMinor: EgpMinor
  /** What the database holds after import, so a dropped value is visible. */
  readonly importedMinor: EgpMinor | null
}

export function buildUnreachableSection(inputs: readonly UnreachableInput[]): {
  values: UnreachableValue[]
  dropped: UnreachableInput[]
} {
  const dropped = inputs.filter((input) => input.importedMinor !== input.storedMinor)

  const values = inputs.map((input) => ({
    sourceRef: input.sourceRef,
    label: `${input.name} (account, kind=${input.kind})`,
    storedMinor: input.storedMinor,
    readBy: '— no formula in the workbook reads this cell',
    disposition:
      input.importedMinor === null
        ? 'NOT IMPORTED — the importer dropped this value'
        : 'imported; excluded from asset totals by kind',
  }))

  return { values, dropped }
}
