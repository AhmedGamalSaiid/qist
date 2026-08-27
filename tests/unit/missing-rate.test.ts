import { describe, expect, it } from 'vitest'
import { MissingRateError } from '../../lib/errors'
import { rateAsOf } from '../../lib/rates/lookup'
import { derivationFixture } from '../helpers/fixture'

/**
 * T044 — a missing rate throws and is never treated as zero
 * (quickstart V6, FR-019, FR-043).
 *
 * A silent zero here would under-report net worth with no visible symptom:
 * every USD holding would simply stop counting, and the total would look
 * plausible.
 */

describe('rateAsOf', () => {
  const { rates } = derivationFixture()

  it('returns the rate in force on the date', () => {
    expect(rateAsOf(rates, 'USD', '2026-08-17').rateMinor).toBe(502554)
    expect(rateAsOf(rates, 'USD', '2026-12-31').rateMinor).toBe(502554)
  })

  it('throws MissingRate before any recorded rate, and never substitutes zero', () => {
    let thrown: unknown
    try {
      rateAsOf(rates, 'USD', '2026-08-16')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(MissingRateError)
    expect((thrown as MissingRateError).assetClass).toBe('USD')
    expect((thrown as MissingRateError).onDate).toBe('2026-08-16')
    expect((thrown as MissingRateError).earliestKnown).toBe('2026-08-17')
    expect((thrown as MissingRateError).message).toMatch(/never treated as zero/)
  })

  it('never reaches forward to a later rate', () => {
    // Reaching forward would value a 2024 transaction at a 2026 rate — the
    // very defect D6 exists to correct.
    expect(() => rateAsOf(rates, 'USD', '2024-01-01')).toThrow(MissingRateError)
  })

  it('throws with a distinguishable class when no rate exists at all', () => {
    const noUsd = rates.filter((r) => r.assetClass !== 'USD')
    let thrown: unknown
    try {
      rateAsOf(noUsd, 'USD', '2030-01-01')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(MissingRateError)
    expect((thrown as MissingRateError).earliestKnown).toBeNull()
  })

  it('picks the newest rate on or before the date, not the newest overall', () => {
    const augmented = [
      ...rates,
      { id: 'R2', assetClass: 'USD' as const, rateMinor: 600_000, scale: 4, asOf: '2026-09-01' },
    ]
    expect(rateAsOf(augmented, 'USD', '2026-08-24').rateMinor).toBe(502554)
    expect(rateAsOf(augmented, 'USD', '2026-09-01').rateMinor).toBe(600_000)
  })
})
