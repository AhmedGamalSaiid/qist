import { describe, expect, it } from 'vitest'
import { transactionEgp } from '../../lib/derive/transactions'
import { rateAsOf } from '../../lib/rates/lookup'
import type { RateRecord } from '../../lib/derive/types'

/**
 * T081 — a value computed as of a past date uses the rate in force on that
 * date, not the latest (FR-018).
 *
 * The failure this guards against is the sheet's: `Transactions!G` multiplies
 * by `Rates!$B$2`, so recording a new rate silently restates every past
 * transaction. A household could not tell you what a purchase cost when they
 * made it.
 */

const RATES: RateRecord[] = [
  { id: 'R2024', assetClass: 'USD', rateMinor: 300_000, scale: 4, asOf: '2024-01-01' },
  { id: 'R2025', assetClass: 'USD', rateMinor: 400_000, scale: 4, asOf: '2025-01-01' },
  { id: 'R2026', assetClass: 'USD', rateMinor: 502_554, scale: 4, asOf: '2026-08-17' },
]

describe('as-of rate lookup', () => {
  it('selects the rate in force on the date, not the newest', () => {
    expect(rateAsOf(RATES, 'USD', '2024-06-01').id).toBe('R2024')
    expect(rateAsOf(RATES, 'USD', '2025-06-01').id).toBe('R2025')
    expect(rateAsOf(RATES, 'USD', '2026-12-31').id).toBe('R2026')
  })

  it('treats a rate as effective from its own date, inclusive', () => {
    expect(rateAsOf(RATES, 'USD', '2025-01-01').id).toBe('R2025')
    expect(rateAsOf(RATES, 'USD', '2024-12-31').id).toBe('R2024')
  })

  it('values a past transaction at the past rate', () => {
    const onDate = '2024-06-01'
    const rate = rateAsOf(RATES, 'USD', onDate)
    // 100 USD at 30.0000 EGP/USD is 3,000.00 EGP — 300,000 piastres — not the
    // 5,025.54 the same 100 USD is worth at today's rate.
    expect(transactionEgp({ amountMinor: 10_000, currency: 'USD', rateId: rate.id }, rate)).toBe(
      300_000,
    )

    const today = rateAsOf(RATES, 'USD', '2026-08-27')
    expect(transactionEgp({ amountMinor: 10_000, currency: 'USD', rateId: today.id }, today)).toBe(
      502_554,
    )
  })

  it('does not move a past figure when a newer rate is added', () => {
    const onDate = '2024-06-01'
    const before = rateAsOf(RATES, 'USD', onDate)
    const withNewer = [
      ...RATES,
      { id: 'R2027', assetClass: 'USD' as const, rateMinor: 900_000, scale: 4, asOf: '2027-01-01' },
    ]
    const after = rateAsOf(withNewer, 'USD', onDate)
    expect(after.id).toBe(before.id)
    expect(after.rateMinor).toBe(before.rateMinor)
  })
})
