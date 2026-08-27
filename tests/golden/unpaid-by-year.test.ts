import { describe, expect, it } from 'vitest'
import { installmentSummary, unpaidByYear } from '../../lib/derive/installments'
import { derivationFixture } from '../helpers/fixture'
import { GOLDEN_INSTALLMENTS, GOLDEN_UNPAID_BY_YEAR } from './expected.generated'

/** T038 — the 21-year spine, and the cross-check that it sums exactly. */

describe('unpaidByYear', () => {
  const { installments, today } = derivationFixture()
  const buckets = unpaidByYear(installments)

  it('reproduces the sheet spine, 2025 to 2045', () => {
    expect(buckets).toHaveLength(21)
    expect(buckets[0]?.year).toBe(2025)
    expect(buckets[20]?.year).toBe(2045)
    expect(buckets).toEqual(GOLDEN_UNPAID_BY_YEAR.map((b) => ({ ...b })))
  })

  it('sums to totalRemaining exactly, with no tolerance', () => {
    // Both are pure sums over the same unpaid set, so they agree to the
    // piastre (FR-029). An earlier draft of the contract recorded a "1 EGP
    // display-rounding artifact" here; that was the goldens' own error. If a
    // mismatch reappears it is a real defect — do not explain it away.
    const sum = buckets.reduce((acc, b) => acc + b.amountMinor, 0)
    expect(sum).toBe(821460520)
    expect(sum).toBe(GOLDEN_INSTALLMENTS.totalRemaining)
    expect(sum).toBe(installmentSummary(installments, today).totalRemaining)
  })

  it('buckets by calendar year, not by a rolling window', () => {
    // Evaluated on any date, a calendar-year bucket holds the same rows.
    expect(unpaidByYear(installments)).toEqual(buckets)
  })
})
