import { describe, expect, it } from 'vitest'
import { assetMix } from '../../lib/derive/dashboard'
import { holdingsByClass } from '../../lib/derive/totals'
import { toleranceFor } from '../../lib/reconcile/verdict'
import { derivationFixture } from '../helpers/fixture'
import { GOLDEN_ASSET_MIX } from './expected.generated'

/** T039 — five classes; USD under the shared tolerance rule, the rest exact. */

describe('assetMix', () => {
  const { accounts, propertyHoldings, rates, today } = derivationFixture()
  const rows = assetMix(
    holdingsByClass(accounts, rates, { isInvestment: false, today }),
    holdingsByClass(accounts, rates, { isInvestment: true, today }),
    propertyHoldings,
  )

  it('produces the five dashboard rows in sheet order', () => {
    expect(rows.map((r) => r.sheetRef)).toEqual(GOLDEN_ASSET_MIX.map((r) => r.sheetRef))
    expect(rows.map((r) => r.label)).toEqual(GOLDEN_ASSET_MIX.map((r) => r.label))
  })

  it('matches every row, with USD allowed its conversion tolerance', () => {
    for (const [index, expected] of GOLDEN_ASSET_MIX.entries()) {
      const actual = rows[index]
      expect(actual, expected.sheetRef).toBeDefined()
      const difference = Math.abs((actual as { egpMinor: number }).egpMinor - expected.egpMinor)
      // The tolerance comes from the same helper the report uses, so the two
      // can never drift apart. Pinning "+/-2 piastres" as a literal here would
      // let the rule change without this test noticing.
      expect(difference, `${expected.sheetRef} differed by ${difference}`).toBeLessThanOrEqual(
        toleranceFor(actual?.conversions ?? 0),
      )
    }
  })

  it('gives USD two conversions and everything else none that matter', () => {
    // F3 accumulates the Total and Investment conversions; gold and silver are
    // zero on the non-investment side, so only one of their two terms is real.
    const byRef = new Map(rows.map((r) => [r.sheetRef, r]))
    expect(byRef.get('Dashboard!F3')?.conversions).toBe(2)
    expect(byRef.get('Dashboard!F4')?.conversions).toBe(1)
    expect(byRef.get('Dashboard!F2')?.conversions).toBe(0)
    expect(byRef.get('Dashboard!F6')?.conversions).toBe(0)
  })

  it('reconciles the non-converting rows exactly', () => {
    const byRef = new Map(rows.map((r) => [r.sheetRef, r]))
    const expected = new Map<string, number>(
      GOLDEN_ASSET_MIX.map((r) => [r.sheetRef, r.egpMinor]),
    )
    for (const ref of ['Dashboard!F2', 'Dashboard!F6']) {
      expect(byRef.get(ref)?.egpMinor, ref).toBe(expected.get(ref))
    }
  })
})
