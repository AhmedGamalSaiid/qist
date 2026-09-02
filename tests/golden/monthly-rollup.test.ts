import { describe, expect, it } from 'vitest'
import { monthlyRollup, sheetMonthSpine, transactionEgp } from '../../lib/derive/transactions'
import { rateAsOf } from '../../lib/rates/lookup'
import { derivationFixture } from '../helpers/fixture'
import { GOLDEN_MONTHLY_ROLLUP } from './expected.generated'

/** T041 — income `502554` (not `502600`), savingsRate 1.0, null for zero months. */

const RATE_EPSILON = 1e-9

describe('monthlyRollup', () => {
  const { rates } = derivationFixture()
  const usd = rateAsOf(rates, 'USD', '2026-08-24')

  const transactions = [
    {
      id: 'T1',
      occurredOn: '2026-08-24',
      kind: 'income' as const,
      amountMinor: 10_000,
      currency: 'USD' as const,
      rateId: usd.id,
      reversesId: null,
      egpMinor: transactionEgp(
        { amountMinor: 10_000, currency: 'USD', rateId: usd.id },
        usd,
      ),
    },
  ]

  const months = sheetMonthSpine('2026-08-01')
  const rows = monthlyRollup(transactions, months)

  it('produces the sheet 24-month forward spine', () => {
    expect(rows).toHaveLength(24)
    expect(rows[0]?.month).toBe('2026-08-01')
    expect(rows[23]?.month).toBe('2028-07-01')
    expect(rows.map((r) => r.month)).toEqual(GOLDEN_MONTHLY_ROLLUP.map((r) => r.month))
  })

  it('reports August 2026 income as 502554, not 502600', () => {
    // `Transactions!G2` is 5025.54 and the dump's `display` rounds it to
    // "5,026". A golden taken from `display` would expect 502600 here — the
    // exact mistake FR-046 exists to prevent.
    const august = rows[0]
    expect(august?.incomeMinor).toBe(502554)
    expect(august?.expenseMinor).toBe(0)
    expect(august?.netMinor).toBe(502554)
  })

  it('matches every month against the sheet', () => {
    for (const [index, expected] of GOLDEN_MONTHLY_ROLLUP.entries()) {
      const actual = rows[index]
      expect(actual?.month, expected.month).toBe(expected.month)
      expect(actual?.incomeMinor, expected.month).toBe(expected.incomeMinor)
      expect(actual?.expenseMinor, expected.month).toBe(expected.expenseMinor)
      expect(actual?.netMinor, expected.month).toBe(expected.netMinor)
    }
  })

  it('compares savingsRate with an explicit epsilon', () => {
    const august = rows[0]
    expect(august?.savingsRate).not.toBeNull()
    expect(Math.abs((august?.savingsRate as number) - 1.0)).toBeLessThan(RATE_EPSILON)
  })

  it('returns null, never 0, for a month with no income', () => {
    // The sheet returns `""` via IFERROR. Turning that into 0 would claim the
    // household saved nothing in a month it earned nothing.
    for (const row of rows.slice(1)) {
      expect(row.savingsRate, row.month).toBeNull()
      expect(row.savingsRate, row.month).not.toBe(0)
    }
    for (const expected of GOLDEN_MONTHLY_ROLLUP.slice(1)) {
      expect(expected.savingsRate, expected.month).toBeNull()
    }
  })

  it('takes its month list as a parameter rather than hard-coding a spine', () => {
    const single = monthlyRollup(transactions, ['2026-08-01'])
    expect(single).toHaveLength(1)
    expect(single[0]?.incomeMinor).toBe(502554)

    const elsewhere = monthlyRollup(transactions, ['2030-01-01'])
    expect(elsewhere[0]?.incomeMinor).toBe(0)
    expect(elsewhere[0]?.savingsRate).toBeNull()
  })
})
