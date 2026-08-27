import { describe, expect, it } from 'vitest'
import { daysInMonth, edate, isLeapYear } from '../../lib/derive/dates'

/** T042 — `EDATE` month-end clamping. */

describe('edate', () => {
  it('clamps 31 January to the last day of February', () => {
    // The 3/6/12-month installment windows disagree at month ends if this is
    // wrong, and the disagreement is invisible on every other date.
    expect(edate('2026-01-31', 1)).toBe('2026-02-28')
    expect(edate('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('clamps to 30-day months', () => {
    expect(edate('2026-03-31', 1)).toBe('2026-04-30')
    expect(edate('2026-05-31', 1)).toBe('2026-06-30')
    expect(edate('2026-08-31', 1)).toBe('2026-09-30')
  })

  it('does not clamp when the day exists in the target month', () => {
    expect(edate('2026-08-27', 3)).toBe('2026-11-27')
    expect(edate('2026-08-27', 6)).toBe('2027-02-27')
    expect(edate('2026-08-27', 12)).toBe('2027-08-27')
  })

  it('crosses year boundaries in both directions', () => {
    expect(edate('2026-11-15', 3)).toBe('2027-02-15')
    expect(edate('2026-02-15', -3)).toBe('2025-11-15')
    expect(edate('2026-01-31', -1)).toBe('2025-12-31')
  })

  it('handles the 12-month window from a leap day', () => {
    expect(edate('2028-02-29', 12)).toBe('2029-02-28')
    expect(edate('2028-02-29', 48)).toBe('2032-02-29')
  })

  it('agrees with the calendar it is built on', () => {
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2028)).toBe(true)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
  })
})
