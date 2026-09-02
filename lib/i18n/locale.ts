/**
 * The UI locale. Two languages, both first-class (Context Brief §5); the
 * layout mirrors wholesale in Arabic and every screen carries `dir`/`lang`
 * from this value.
 *
 * Carried as a cookie rather than a path segment: the app shell has not
 * decided locale routing yet (app/layout.tsx), and a cookie lets the sign-in
 * screen honour the person's choice on the server render — no flash of the
 * other language — without pre-empting that decision. If the shell chooses
 * sub-path routing later, this module is the one place to change.
 */
export type Locale = 'en' | 'ar'

export const LOCALES: readonly Locale[] = ['en', 'ar']
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'qist-locale'
/** One year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ar'
}

export function parseLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar'
}
