import { describe, expect, it } from 'vitest'
import { TimezonePreflightError } from '../../lib/errors'
import { timezonePreflight } from '../../lib/import/preflight'
import { derivationFixture } from '../helpers/fixture'

/**
 * T045 — the timezone preflight (FR-048).
 *
 * The committed dump still records `America/Los_Angeles` while the household
 * is `Africa/Cairo`, so this is a live check rather than a formality.
 */

describe('timezonePreflight', () => {
  const { dump } = derivationFixture()

  it('passes on the committed dump', () => {
    const result = timezonePreflight(dump, { timezone: 'Africa/Cairo' })
    expect(result.sourceDate).toBe('2026-08-27')
    expect(result.householdDate).toBe('2026-08-27')
    expect(result.sourceTimezone).toBe('America/Los_Angeles')
  })

  it('refuses a dump whose zones straddle a date boundary, with a reason', () => {
    // 2026-08-27T22:00Z is the 27th in Los Angeles and the 28th in Cairo.
    // Every TODAY()-dependent figure in such a dump is internally
    // inconsistent with the dates this system computes.
    const straddling = { extractedAt: '2026-08-27T22:00:00.000Z', sourceTimeZone: 'America/Los_Angeles' }

    let thrown: unknown
    try {
      timezonePreflight(straddling, { timezone: 'Africa/Cairo' })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(TimezonePreflightError)
    const error = thrown as TimezonePreflightError
    expect(error.sourceDate).toBe('2026-08-27')
    expect(error.householdDate).toBe('2026-08-28')
    expect(error.message).toMatch(/Re-extract the sheet/)
  })

  it('checks the household configured zone, not a hardcoded one', () => {
    // Same dump, a household in Kiritimati: now the zones disagree, and the
    // preflight has to say so. A check against a constant would pass here.
    expect(() => timezonePreflight(dump, { timezone: 'Pacific/Kiritimati' })).toThrow(
      TimezonePreflightError,
    )
    expect(() => timezonePreflight(dump, { timezone: 'America/Los_Angeles' })).not.toThrow()
  })

  it('refuses an unparseable extraction timestamp rather than guessing', () => {
    expect(() =>
      timezonePreflight({ extractedAt: 'yesterday', sourceTimeZone: 'UTC' }, { timezone: 'UTC' }),
    ).toThrow(/not a parseable instant/)
  })
})
