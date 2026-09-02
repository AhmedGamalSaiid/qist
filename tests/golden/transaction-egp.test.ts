import { describe, expect, it } from 'vitest'
import { transactionEgp } from '../../lib/derive/transactions'
import { rateAsOf } from '../../lib/rates/lookup'
import { derivationFixture } from '../helpers/fixture'
import { GOLDEN_TRANSACTION_EGP } from './expected.generated'

/** T040 — `502554` for the single 100 USD transaction, at the pinned rate. */

describe('transactionEgp', () => {
  const { rates } = derivationFixture()
  const occurredOn = '2026-08-24'
  const pinned = rateAsOf(rates, 'USD', occurredOn)

  it('converts the sole transaction at the rate in force on its own date', () => {
    const result = transactionEgp(
      { amountMinor: 10_000, currency: 'USD', rateId: pinned.id },
      pinned,
    )
    expect(result).toBe(GOLDEN_TRANSACTION_EGP)
    expect(result).toBe(502554)
  })

  it('leaves an EGP transaction alone and needs no rate', () => {
    expect(transactionEgp({ amountMinor: 123_456, currency: 'EGP', rateId: null }, null)).toBe(
      123_456,
    )
  })

  it('stays frozen when a later rate is recorded', () => {
    // This is D6 made concrete. The sheet's `Transactions!G` is
    // `E2*Rates!$B$2` — the *current* rate — so recording a new rate restates
    // every past transaction. Pinning the rate means this figure does not
    // move, which is the intended divergence (FR-042).
    const laterRate = { ...pinned, id: 'LATER', rateMinor: 600_000, asOf: '2026-09-01' }
    const withLater = [...rates, laterRate]

    expect(rateAsOf(withLater, 'USD', occurredOn).id).toBe(pinned.id)
    expect(
      transactionEgp({ amountMinor: 10_000, currency: 'USD', rateId: pinned.id }, pinned),
    ).toBe(502554)
    // The live-rate evaluation the sheet would perform, for contrast.
    expect(
      transactionEgp({ amountMinor: 10_000, currency: 'USD', rateId: laterRate.id }, laterRate),
    ).toBe(600_000)
  })

  it('produces the same number the sheet does on today data', () => {
    // The sole imported rate is also the live rate captured in the dump, so
    // frozen-rate and live-rate evaluation agree. The divergence is real but
    // behavioural: today it is a PASS, not a DIVERGED (reconciliation.md).
    const live = rateAsOf(rates, 'USD', '2026-08-27')
    expect(live.rateMinor).toBe(pinned.rateMinor)
  })
})
