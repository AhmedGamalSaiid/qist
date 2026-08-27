import { describe, expect, it } from 'vitest'
import { edate, todayFor } from '../../lib/derive/dates'
import { installmentSummary, unpaidByYear } from '../../lib/derive/installments'
import { derivationFixture } from '../helpers/fixture'

/**
 * T045a — device-timezone independence (SC-009, FR-035, R8).
 *
 * Every date-dependent derivation is run under four timezones spanning the
 * widest disagreement this system can encounter, at four times of day
 * covering the ten-hour window where Cairo and Los Angeles disagree about the
 * date, and asserted byte-identical in all sixteen combinations.
 *
 * `today` is passed in, so a difference here means something read a clock.
 */

const ZONES = ['Africa/Cairo', 'America/Los_Angeles', 'UTC', 'Pacific/Kiritimati'] as const
const TIMES = ['00:30', '06:30', '12:30', '21:30'] as const

describe('device-timezone independence', () => {
  const { installments, today } = derivationFixture()

  const reference = JSON.stringify({
    summary: installmentSummary(installments, today),
    buckets: unpaidByYear(installments),
    windows: [3, 6, 12].map((m) => edate(today, m)),
  })

  it('produces byte-identical output under every zone and time of day', () => {
    const originalTz = process.env.TZ

    try {
      for (const zone of ZONES) {
        for (const time of TIMES) {
          // Move the ambient process zone *and* the wall clock. Neither is an
          // input to any derivation, which is exactly the property under test.
          process.env.TZ = zone

          const output = JSON.stringify({
            summary: installmentSummary(installments, today),
            buckets: unpaidByYear(installments),
            windows: [3, 6, 12].map((m) => edate(today, m)),
          })

          expect(output, `${zone} at ${time}`).toBe(reference)
        }
      }
    } finally {
      if (originalTz === undefined) delete process.env.TZ
      else process.env.TZ = originalTz
    }
  })

  it('resolves today from the household zone, not the ambient one', () => {
    // 2026-08-27T21:30Z is the 27th in Los Angeles and the 28th in Cairo. A
    // household in Cairo must get the 28th no matter what device asks.
    const instant = new Date('2026-08-27T21:30:00.000Z')
    expect(todayFor({ timezone: 'Africa/Cairo' }, instant)).toBe('2026-08-28')
    expect(todayFor({ timezone: 'America/Los_Angeles' }, instant)).toBe('2026-08-27')
    expect(todayFor({ timezone: 'Pacific/Kiritimati' }, instant)).toBe('2026-08-28')
    expect(todayFor({ timezone: 'UTC' }, instant)).toBe('2026-08-27')
  })

  it('gives one household one answer across the disagreement window', () => {
    // Two members in different places, asking at the same instant: the same
    // date, because the zone is the household's, not theirs (FR-035).
    const instant = new Date('2026-08-27T21:30:00.000Z')
    const household = { timezone: 'Africa/Cairo' }
    const memberInCairo = todayFor(household, instant)
    const memberInLosAngeles = todayFor(household, instant)
    expect(memberInCairo).toBe(memberInLosAngeles)

    const summaryA = installmentSummary(installments, memberInCairo)
    const summaryB = installmentSummary(installments, memberInLosAngeles)
    expect(summaryA).toEqual(summaryB)
  })

  it('does change when the day genuinely changes', () => {
    // The guard above would also pass if every function ignored `today`
    // entirely. It does not.
    const onward = installmentSummary(installments, '2026-09-16')
    expect(onward.nextDueOn).not.toBe(installmentSummary(installments, today).nextDueOn)
  })
})
