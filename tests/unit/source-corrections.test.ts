import { describe, expect, it } from 'vitest'
import {
  loadSourceCorrections,
  parseSourceCorrections,
} from '../../lib/reconcile/discrepancies'
import { buildUnreachableSection } from '../../lib/reconcile/unreachable'

/**
 * The resolved-source-defect register (D7).
 *
 * The owner's resolution is read from the committed register, never inferred
 * and never hard-coded. That matters twice over: FR-010 requires the record to
 * be written down rather than deduced, and the account names in question are
 * one household's data — a migration tool may read them from a file, but the
 * schema it writes serves every household, so they must not appear in code.
 */

describe('resolved source-data defects', () => {
  it('reads the committed register', () => {
    const corrections = loadSourceCorrections()
    const adib = corrections.find((c) => c.sourceRef === 'Data!D13')

    expect(adib).toBeDefined()
    expect(adib?.authoritativeMinor).toBe(60_000)
    expect(adib?.reason).toMatch(/entered incorrectly/)
    expect(adib?.reason).toMatch(/not a separate liability/)
  })

  it('ignores rows that are not source corrections', () => {
    const parsed = parseSourceCorrections(`
| sheet_ref | resolution | reason |
|---|---|---|
| \`Net Worth!B12\` | computed-correct | something else entirely |
| \`Data!D13\` | source-corrected | 60000 | the real balance |
`)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.sourceRef).toBe('Data!D13')
  })

  it('prints the resolution against the matching unreachable value', () => {
    const { values } = buildUnreachableSection(
      [
        {
          sourceRef: 'Data!D13',
          name: 'ADIB C.C',
          kind: 'liability',
          storedMinor: 60_000,
          importedMinor: 60_000,
        },
        {
          sourceRef: 'Data!D14',
          name: 'HSBC C.C',
          kind: 'liability',
          storedMinor: 0,
          importedMinor: 0,
        },
      ],
      [{ sourceRef: 'Data!D13', authoritativeMinor: 60_000, reason: 'the owner says so' }],
    )

    expect(values[0]?.resolution).toBe('the owner says so')
    // A value with no register entry stays an open fact, not a resolved one.
    expect(values[1]?.resolution).toBeUndefined()
  })

  it('flags a register figure that disagrees with the cell it resolves', () => {
    const { values } = buildUnreachableSection(
      [
        {
          sourceRef: 'Data!D13',
          name: 'ADIB C.C',
          kind: 'liability',
          storedMinor: 60_000,
          importedMinor: 60_000,
        },
      ],
      [{ sourceRef: 'Data!D13', authoritativeMinor: 99_999, reason: 'stale note' }],
    )
    expect(values[0]?.resolution).toMatch(/REGISTER MISMATCH/)
  })

  it('reports a register entry naming a cell that is not listed', () => {
    // A stale resolution record is worse than none: it reads as though a
    // question was settled when the data it referred to has moved.
    const { orphanedResolutions } = buildUnreachableSection(
      [],
      [{ sourceRef: 'Data!D99', authoritativeMinor: 1, reason: 'points at nothing' }],
    )
    expect(orphanedResolutions).toHaveLength(1)
    expect(orphanedResolutions[0]?.sourceRef).toBe('Data!D99')
  })
})
