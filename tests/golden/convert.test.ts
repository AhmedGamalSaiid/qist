import { describe, expect, it } from 'vitest'
import { convert } from '../../lib/money/convert'
import type { RateLike } from '../../lib/money/types'
import { GOLDEN_INVESTMENT, GOLDEN_RATES, GOLDEN_TOTAL } from './expected.generated'

/** T033 — the four conversion rows in `derivations.md`, plus EGP identity. */

const usd: RateLike = { assetClass: 'USD', ...GOLDEN_RATES.USD }
const gold: RateLike = { assetClass: 'GOLD', ...GOLDEN_RATES.GOLD }
const silver: RateLike = { assetClass: 'SILVER', ...GOLDEN_RATES.SILVER }

describe('convert', () => {
  it('converts USD cents at the rate captured in the dump', () => {
    expect(convert(GOLDEN_TOTAL.usdNative, 'USD', usd)).toBe(GOLDEN_TOTAL.usdEgp)
    expect(convert(GOLDEN_INVESTMENT.usdNative, 'USD', usd)).toBe(GOLDEN_INVESTMENT.usdEgp)
  })

  it('converts gold and silver milligrams', () => {
    expect(convert(GOLDEN_INVESTMENT.goldNative, 'GOLD', gold)).toBe(GOLDEN_INVESTMENT.goldEgp)
    expect(convert(GOLDEN_INVESTMENT.silverNative, 'SILVER', silver)).toBe(
      GOLDEN_INVESTMENT.silverEgp,
    )
  })

  it('treats EGP as identity and needs no rate', () => {
    expect(convert(GOLDEN_TOTAL.egp, 'EGP', null)).toBe(GOLDEN_TOTAL.egp)
    expect(convert(0, 'EGP', null)).toBe(0)
  })

  it('converts a zero quantity exactly', () => {
    // A figure whose conversion inputs are all zero has `conversions 0` and
    // must reconcile exactly — no tolerance is earned by a term that did
    // nothing (contracts/reconciliation.md).
    expect(convert(0, 'GOLD', gold)).toBe(0)
    expect(convert(0, 'USD', usd)).toBe(0)
  })

  it('refuses to convert a foreign class without a rate', () => {
    expect(() => convert(100, 'USD', null)).toThrow(/rateAsOf/)
  })

  it('refuses a rate for the wrong class', () => {
    expect(() => convert(100, 'USD', gold)).toThrow(/GOLD rate for a USD quantity/)
  })
})
