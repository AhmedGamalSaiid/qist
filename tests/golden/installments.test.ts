import { describe, expect, it } from 'vitest'
import { installmentSummary } from '../../lib/derive/installments'
import { derivationFixture } from '../helpers/fixture'
import { GOLDEN_INSTALLMENTS } from './expected.generated'

/** T037 — all nine fields of `Installments!H2:H10`. */

describe('installmentSummary', () => {
  const { installments, today } = derivationFixture()
  const summary = installmentSummary(installments, today)

  it('reproduces every summary field', () => {
    expect(summary.totalScheduled).toBe(GOLDEN_INSTALLMENTS.totalScheduled)
    expect(summary.totalPaid).toBe(GOLDEN_INSTALLMENTS.totalPaid)
    expect(summary.totalRemaining).toBe(GOLDEN_INSTALLMENTS.totalRemaining)
    expect(summary.nextDueOn).toBe(GOLDEN_INSTALLMENTS.nextDueOn)
    expect(summary.nextAmountDue).toBe(GOLDEN_INSTALLMENTS.nextAmountDue)
    expect(summary.due3m).toBe(GOLDEN_INSTALLMENTS.due3m)
    expect(summary.due6m).toBe(GOLDEN_INSTALLMENTS.due6m)
    expect(summary.due12m).toBe(GOLDEN_INSTALLMENTS.due12m)
    expect(summary.overdue).toBe(GOLDEN_INSTALLMENTS.overdue)
  })

  it('lands on a non-zero piastre wherever fractional installments contribute', () => {
    // Ten of the 56 installments carry fractional EGP (14,752.80 and
    // 29,505.60). A figure here ending in `00` is the signature of a golden
    // taken from the dump's rounded `display` string rather than its `value`
    // — which is exactly the bug that put this assertion here (FR-046).
    const fractional = installments.filter((i) => i.amountMinor % 100 !== 0)
    expect(fractional).toHaveLength(10)

    const mustBeFractional: Array<[string, number]> = [
      ['totalPaid', summary.totalPaid],
      ['totalRemaining', summary.totalRemaining],
      ['nextAmountDue', summary.nextAmountDue],
      ['due3m', summary.due3m],
      ['due6m', summary.due6m],
      ['due12m', summary.due12m],
    ]
    for (const [name, value] of mustBeFractional) {
      expect(value % 100, `${name} ended in 00`).not.toBe(0)
    }

    // `totalScheduled` and `overdue` are the exceptions: every fractional
    // installment appears twice over in the first (cancelling to a round
    // number) and the second is zero today.
    expect(summary.totalScheduled % 100).toBe(0)
    expect(summary.overdue).toBe(0)
  })

  it('takes today as a parameter rather than reading a clock', () => {
    // Same data, a different day: the windows move. A function that read a
    // clock could not be asserted like this at all.
    const later = installmentSummary(installments, '2026-10-01')
    expect(later.nextDueOn).not.toBe(summary.nextDueOn)
    expect(later.overdue).toBeGreaterThan(0)
    expect(later.totalRemaining).toBe(summary.totalRemaining)
  })

  it('counts an installment due exactly today as neither overdue nor excluded', () => {
    const onDueDate = installmentSummary(installments, '2026-09-15')
    expect(onDueDate.overdue).toBe(0)
    expect(onDueDate.nextDueOn).toBe('2026-09-15')
    expect(onDueDate.nextAmountDue).toBe(GOLDEN_INSTALLMENTS.nextAmountDue)
  })
})
