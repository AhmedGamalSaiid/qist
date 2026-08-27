import { describe, expect, it } from 'vitest'
import { holdingsByClass } from '../../lib/derive/totals'
import { derivationFixture } from '../helpers/fixture'
import { GOLDEN_INVESTMENT, GOLDEN_TOTAL } from './expected.generated'

/** T034 — both partitions, all four classes, liability accounts excluded. */

describe('holdingsByClass', () => {
  const { accounts, rates, today } = derivationFixture()

  it('reproduces the non-investment partition (Total!D2:J2)', () => {
    const holdings = holdingsByClass(accounts, rates, { isInvestment: false, today })
    expect(holdings.USD.nativeMinor).toBe(GOLDEN_TOTAL.usdNative)
    expect(holdings.USD.egpMinor).toBe(GOLDEN_TOTAL.usdEgp)
    expect(holdings.EGP.nativeMinor).toBe(GOLDEN_TOTAL.egp)
    expect(holdings.EGP.egpMinor).toBe(GOLDEN_TOTAL.egp)
    expect(holdings.GOLD.nativeMinor).toBe(GOLDEN_TOTAL.goldNative)
    expect(holdings.GOLD.egpMinor).toBe(GOLDEN_TOTAL.goldEgp)
    expect(holdings.SILVER.nativeMinor).toBe(GOLDEN_TOTAL.silverNative)
    expect(holdings.SILVER.egpMinor).toBe(GOLDEN_TOTAL.silverEgp)
  })

  it('reproduces the investment partition (Investment!D2:J2)', () => {
    const holdings = holdingsByClass(accounts, rates, { isInvestment: true, today })
    expect(holdings.USD.nativeMinor).toBe(GOLDEN_INVESTMENT.usdNative)
    expect(holdings.USD.egpMinor).toBe(GOLDEN_INVESTMENT.usdEgp)
    expect(holdings.GOLD.nativeMinor).toBe(GOLDEN_INVESTMENT.goldNative)
    expect(holdings.GOLD.egpMinor).toBe(GOLDEN_INVESTMENT.goldEgp)
    expect(holdings.SILVER.nativeMinor).toBe(GOLDEN_INVESTMENT.silverNative)
    expect(holdings.SILVER.egpMinor).toBe(GOLDEN_INVESTMENT.silverEgp)
    expect(holdings.EGP.nativeMinor).toBe(GOLDEN_INVESTMENT.egp)
  })

  it('excludes liability-kind accounts from every class total', () => {
    // Both liability rows are EGP-denominated, and one carries 600 EGP. If the
    // exclusion were done by matching class strings rather than by filtering
    // on `kind`, that 600 would land inside the EGP total (D7, FR-045).
    const liabilityAccounts = accounts.filter((a) => a.kind === 'liability')
    expect(liabilityAccounts).toHaveLength(2)
    expect(liabilityAccounts.some((a) => a.quantityMinor > 0)).toBe(true)

    const holdings = holdingsByClass(accounts, rates, { isInvestment: false, today })
    const assetOnlyEgp = accounts
      .filter((a) => a.kind === 'asset' && !a.isInvestment && a.assetClass === 'EGP')
      .reduce((sum, a) => sum + a.quantityMinor, 0)
    expect(holdings.EGP.nativeMinor).toBe(assetOnlyEgp)
    expect(holdings.EGP.nativeMinor).toBe(GOLDEN_TOTAL.egp)
  })

  it('marks a zero-quantity class as not having converted', () => {
    const holdings = holdingsByClass(accounts, rates, { isInvestment: false, today })
    expect(holdings.GOLD.converted).toBe(false)
    expect(holdings.USD.converted).toBe(true)
    expect(holdings.EGP.converted).toBe(false)
  })
})
