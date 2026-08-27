import { describe, expect, it } from 'vitest'
import { holdingsByClass } from '../../lib/derive/totals'
import { installmentSummary } from '../../lib/derive/installments'
import { netWorth } from '../../lib/derive/networth'
import { derivationFixture } from '../helpers/fixture'
import { GOLDEN_NET_WORTH } from './expected.generated'

/** T036 — all six fields, including the negative `includingInstallments`. */

describe('netWorth', () => {
  const { accounts, propertyHoldings, liabilities, installments, rates, today } = derivationFixture()
  const result = netWorth({
    totalHoldings: holdingsByClass(accounts, rates, { isInvestment: false, today }),
    investmentHoldings: holdingsByClass(accounts, rates, { isInvestment: true, today }),
    propertyHoldings,
    liabilities,
    remainingInstallments: installmentSummary(installments, today).totalRemaining,
  })

  it('reproduces every figure on Net Worth!B12:B20', () => {
    expect(result.totalAssets).toBe(GOLDEN_NET_WORTH.totalAssets)
    expect(result.shortTermLiabilities).toBe(GOLDEN_NET_WORTH.shortTermLiabilities)
    expect(result.remainingInstallments).toBe(GOLDEN_NET_WORTH.remainingInstallments)
    expect(result.totalLiabilities).toBe(GOLDEN_NET_WORTH.totalLiabilities)
    expect(result.excludingInstallments).toBe(GOLDEN_NET_WORTH.excludingInstallments)
    expect(result.includingInstallments).toBe(GOLDEN_NET_WORTH.includingInstallments)
  })

  it('returns both figures, and they differ by the installment balance', () => {
    // D4: the sheet displays only B20 and silently omits 8.2 million EGP of
    // committed liability. Exposing one figure without the other is what this
    // feature corrects, so a test that only checked B20 would miss the point.
    expect(result.includingInstallments).toBe(-782483081)
    expect(result.excludingInstallments).toBe(38977439)
    expect(result.excludingInstallments - result.includingInstallments).toBe(
      result.remainingInstallments,
    )
  })

  it('rounds the negative figure away from zero', () => {
    // B19's float chain is -7,824,830.808. Rounding toward zero would give
    // -782483080 and drift a piastre in the household's favour.
    expect(result.includingInstallments).toBeLessThan(0)
    expect(result.includingInstallments).toBe(GOLDEN_NET_WORTH.includingInstallments)
  })
})
