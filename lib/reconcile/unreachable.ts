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
  /**
   * The owner's resolution, when the register records one. An unreachable
   * value can be a fact the sheet simply never surfaces — or the *correct*
   * figure that a second, contradictory cell overrides. Only the owner can
   * tell those apart, so the answer is read from the register rather than
   * inferred here.
   */
  readonly resolution?: string
}

/** One entry from the register's resolved source-data defects table. */
export interface ResolvedSourceDefect {
  readonly sourceRef: string
  readonly authoritativeMinor: number | null
  readonly reason: string
}

export interface UnreachableInput {
  readonly sourceRef: string
  readonly name: string
  readonly kind: 'asset' | 'liability'
  readonly storedMinor: EgpMinor
  /** What the database holds after import, so a dropped value is visible. */
  readonly importedMinor: EgpMinor | null
}

export function buildUnreachableSection(
  inputs: readonly UnreachableInput[],
  resolved: readonly ResolvedSourceDefect[] = [],
): {
  values: UnreachableValue[]
  dropped: UnreachableInput[]
  /** Register entries naming a cell this section does not list — a stale register. */
  orphanedResolutions: ResolvedSourceDefect[]
} {
  const dropped = inputs.filter((input) => input.importedMinor !== input.storedMinor)
  const byRef = new Map(resolved.map((entry) => [entry.sourceRef, entry]))

  const values = inputs.map((input) => {
    const resolution = byRef.get(input.sourceRef)
    const value: UnreachableValue = {
      sourceRef: input.sourceRef,
      label: `${input.name} (account, kind=${input.kind})`,
      storedMinor: input.storedMinor,
      readBy: '— no formula in the workbook reads this cell',
      disposition:
        input.importedMinor === null
          ? 'NOT IMPORTED — the importer dropped this value'
          : 'imported; excluded from asset totals by kind',
    }
    if (resolution === undefined) return value

    // A register entry whose figure disagrees with the cell it resolves is a
    // defect in the register, and saying so is more use than printing both and
    // letting the reader decide which to believe.
    const mismatch =
      resolution.authoritativeMinor !== null &&
      resolution.authoritativeMinor !== input.storedMinor
        ? ` [REGISTER MISMATCH: the register records ${resolution.authoritativeMinor}, this cell holds ${input.storedMinor}]`
        : ''

    return { ...value, resolution: `${resolution.reason}${mismatch}` }
  })

  const listed = new Set(inputs.map((input) => input.sourceRef))
  const orphanedResolutions = resolved.filter((entry) => !listed.has(entry.sourceRef))

  return { values, dropped, orphanedResolutions }
}
