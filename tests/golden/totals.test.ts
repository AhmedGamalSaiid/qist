import { describe, expect, it } from 'vitest'
import { holdingsByClass, investmentTotal, shortTermLiabilities, totalOfAll } from '../../lib/derive/totals'
import { derivationFixture } from '../helpers/fixture'
import { GOLDEN_INVESTMENT, GOLDEN_TOTAL } from './expected.generated'

/** T035 — `Total!K2`, `Total!L2` and `Investment!K2`. */

describe('totals', () => {
  const { accounts, liabilities, rates, today } = derivationFixture()
  const total = holdingsByClass(accounts, rates, { isInvestment: false, today })
  const investment = holdingsByClass(accounts, rates, { isInvestment: true, today })

  it('sums short-term liabilities exactly (Total!K2)', () => {
    // A plain sum. No tolerance, ever (FR-029).
    expect(shortTermLiabilities(liabilities)).toBe(GOLDEN_TOTAL.shortTermLiabilities)
    expect(shortTermLiabilities(liabilities)).toBe(8010900)
  })

  it('reproduces Total!L2 — which excludes investments despite its label', () => {
    expect(totalOfAll(total, liabilities)).toBe(GOLDEN_TOTAL.totalOfAll)
    expect(totalOfAll(total, liabilities)).toBe(10971520)
  })

  it('reproduces Investment!K2', () => {
    expect(investmentTotal(investment)).toBe(GOLDEN_INVESTMENT.investmentTotal)
    expect(investmentTotal(investment)).toBe(28005919)
  })
})
