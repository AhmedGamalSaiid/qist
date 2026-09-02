import type { IsoDate } from '../money/types'

/**
 * Calendar-date arithmetic (T019a, T055).
 *
 * Nothing in this file reads a clock. `todayFor` takes the instant as a
 * parameter and turns it into a calendar date in the household's own zone;
 * the caller at the edge of the system (a CLI script, a request handler) is
 * the only place `new Date()` appears. `lint:money` enforces that: an argless
 * `new Date()` or a `Date.now()` anywhere under `lib/derive/` is rejected.
 *
 * This is what makes every TODAY()-dependent figure deterministic and
 * therefore testable, and it is why `installmentSummary` takes `today` rather
 * than looking it up (R8).
 */

const DATE_PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = DATE_PART_FORMATTERS.get(timeZone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    DATE_PART_FORMATTERS.set(timeZone, formatter)
  }
  return formatter
}

/**
 * The calendar date an instant falls on, in a named IANA zone.
 *
 * This is the only correct way to read the dump's dates: the spreadsheet
 * stores them as instants at midnight in its own zone, so reading them as UTC
 * shifts every one of them by a day for part of the year.
 */
export function calendarDateIn(instant: Date, timeZone: string): IsoDate {
  const parts = formatterFor(timeZone).formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type)
    if (part === undefined) {
      throw new TypeError(`Intl did not return a ${type} part for timezone ${timeZone}`)
    }
    return part.value
  }
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Today, in the household's configured timezone (FR-034, FR-035).
 *
 * The **only** sanctioned way to obtain "today". Every derivation receives the
 * result as a parameter; none calls this itself. `now` is a parameter rather
 * than a clock read so that this function is pure and so that the lint rule
 * above needs no exemption — the household's zone is configuration, never the
 * requesting device's zone and never an ambient `TZ`.
 */
export function todayFor(household: { readonly timezone: string }, now: Date): IsoDate {
  return calendarDateIn(now, household.timezone)
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(date)
  if (match === null) {
    throw new TypeError(`Not a YYYY-MM-DD calendar date: ${JSON.stringify(date)}`)
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function isoDateOf(year: number, month: number, day: number): IsoDate {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** Days in a month, Gregorian. */
export function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month === 2 && isLeapYear(year)) return 29
  const length = lengths[month - 1]
  if (length === undefined) throw new TypeError(`Not a month: ${month}`)
  return length
}

export function isLeapYear(year: number): boolean {
  if (year % 4 !== 0) return false
  if (year % 100 !== 0) return true
  return year % 400 === 0
}

/**
 * The spreadsheet's `EDATE`: add `months` and clamp to the last valid day of
 * the target month (T042, T055).
 *
 * 31 Jan + 1 month is 28 or 29 Feb, not 2 or 3 March. The 3/6/12-month
 * installment windows disagree at month ends if this is wrong, and the
 * disagreement is invisible on most dates.
 */
export function edate(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(date)

  // Carried by addition rather than by dividing a month index, so that
  // `lint:money`'s no-division rule can stay absolute over `lib/derive/`
  // instead of needing a calendar-shaped exemption that a monetary
  // calculation could later hide behind. The loops run at most once per year
  // of offset.
  let targetYear = year
  let targetMonth = month + months
  while (targetMonth > 12) {
    targetMonth -= 12
    targetYear += 1
  }
  while (targetMonth < 1) {
    targetMonth += 12
    targetYear -= 1
  }

  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth))
  return isoDateOf(targetYear, targetMonth, clampedDay)
}

/** The first day of the month `date` falls in. */
export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date)
  return isoDateOf(year, month, 1)
}

/**
 * Calendar dates in `YYYY-MM-DD` sort correctly as strings, which is why every
 * date in this system is stored that way. These helpers exist so the intent
 * reads at the call site rather than looking like an accidental string compare.
 */
export function isOnOrAfter(date: IsoDate, other: IsoDate): boolean {
  return date >= other
}

export function isOnOrBefore(date: IsoDate, other: IsoDate): boolean {
  return date <= other
}

export function isBefore(date: IsoDate, other: IsoDate): boolean {
  return date < other
}

/** The calendar year of a date, as a number. */
export function yearOf(date: IsoDate): number {
  return parseIsoDate(date).year
}

/** The next calendar day. Carries by addition, never by division. */
export function nextDay(date: IsoDate): IsoDate {
  const { year, month, day } = parseIsoDate(date)
  if (day < daysInMonth(year, month)) return isoDateOf(year, month, day + 1)
  if (month < 12) return isoDateOf(year, month + 1, 1)
  return isoDateOf(year + 1, 1, 1)
}

/** Guards against a malformed date turning the walk below into a hang. */
const MAX_DAY_SPAN = 400 * 366

/**
 * Whole days from `from` to `to`, negative when `to` precedes `from`.
 *
 * Counted by walking days rather than by dividing a millisecond difference, so
 * that `lint:money`'s no-division rule stays absolute across `lib/derive/` and
 * `lib/rates/` instead of acquiring a second exemption. Quickstart V7 names
 * exactly one exempt identifier, and a calendar-shaped exemption is precisely
 * the kind of widening that would let a monetary float through later.
 *
 * The walk is cheap: rate ages are days or weeks, and it runs once per asset
 * class per report.
 */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  if (from === to) return 0
  const forward = from < to
  const start = forward ? from : to
  const end = forward ? to : from

  let cursor = start
  let days = 0
  while (cursor !== end) {
    cursor = nextDay(cursor)
    days += 1
    if (days > MAX_DAY_SPAN) {
      throw new TypeError(
        `daysBetween(${from}, ${to}) exceeded ${MAX_DAY_SPAN} days; one of these is not a real date.`,
      )
    }
  }
  return forward ? days : -days
}
