import { calendarDateIn } from '../derive/dates'
import { TimezonePreflightError } from '../errors'
import type { Dump } from './dump'

/**
 * Timezone preflight (FR-048, T009).
 *
 * The spreadsheet evaluates `TODAY()` in its own zone; this system evaluates
 * every date in the household's. The committed dump still records
 * `America/Los_Angeles` while the household is `Africa/Cairo` — ten hours
 * apart, so for ten hours of every day the two disagree about what day it is.
 * An extraction taken inside that window produces a dump whose
 * `TODAY()`-dependent figures are internally inconsistent with anything this
 * system computes, and the only symptom is goldens failing in a way that looks
 * like a code defect.
 *
 * The household's zone is read from configuration (T022), never hardcoded:
 * a preflight that checks against a constant stops being a check the moment
 * the household moves.
 */
export interface PreflightResult {
  readonly extractedAt: string
  readonly sourceTimezone: string
  readonly householdTimezone: string
  readonly sourceDate: string
  readonly householdDate: string
}

export function timezonePreflight(
  dump: Pick<Dump, 'extractedAt' | 'sourceTimeZone'>,
  household: { readonly timezone: string },
): PreflightResult {
  const instant = new Date(dump.extractedAt)
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError(
      `The dump's extractedAt is not a parseable instant: ${JSON.stringify(dump.extractedAt)}`,
    )
  }

  const sourceDate = calendarDateIn(instant, dump.sourceTimeZone)
  const householdDate = calendarDateIn(instant, household.timezone)

  if (sourceDate !== householdDate) {
    throw new TimezonePreflightError({
      sourceTimezone: dump.sourceTimeZone,
      householdTimezone: household.timezone,
      extractedAt: dump.extractedAt,
      sourceDate,
      householdDate,
    })
  }

  return {
    extractedAt: dump.extractedAt,
    sourceTimezone: dump.sourceTimeZone,
    householdTimezone: household.timezone,
    sourceDate,
    householdDate,
  }
}
