import type { Locale } from '../../lib/i18n/locale'

/**
 * Every string on screen 1, both languages, by state (Sign in handoff §5).
 * Arabic is written Egyptian Arabic, not translated; do not regenerate it
 * with machine translation.
 *
 * A4's Arabic block was written by a native Egyptian Arabic speaker against
 * the same three obligations as the English (nothing was written; here is
 * the fix; the refusal is deliberate). Open naming question: "بيت" stands
 * for household here and must match whatever Arabic term the rest of the
 * product settles on.
 */

/** A paragraph carrying the OWNER_EMAIL literal as a slot, wherever the language's word order puts it. */
export type Slotted = ReadonlyArray<string | { readonly slot: 'OWNER_EMAIL' }>

export const OWNER_EMAIL_LITERAL = 'OWNER_EMAIL'

export type SignInCopy = {
  readonly langSwitch: string
  readonly langSwitchFont: 'ui' | 'arabicPending'
  readonly a2: { readonly title: string; readonly body: string }
  readonly a3: { readonly title: string; readonly body: string }
  readonly a5: { readonly title: string; readonly body: string }
  readonly a4: {
    readonly eyebrow: string
    readonly retry: string
    readonly copyLabel: string
    readonly content: { readonly heading: string; readonly p1: string; readonly p2: Slotted }
  }
}

const en: SignInCopy = {
  langSwitch: 'العربية',
  langSwitchFont: 'arabicPending',
  a2: { title: 'Continuing at Google', body: 'This leaves the app. You come back here.' },
  a3: { title: 'Not signed in', body: 'There is no session. Sign in to continue.' },
  a5: { title: 'Signed out', body: 'The session ended on the server.' },
  a4: {
    eyebrow: 'Sign-in refused',
    retry: 'Try sign-in again',
    copyLabel: 'Copy',
    // Approved copy, verbatim. Do not edit, shorten, or re-tone.
    content: {
      heading: 'Sign-in is closed until an owner is set',
      p1: 'This deployment holds a household migrated from the spreadsheet, and no owner has been designated for it. Signing in now would create a second, empty household competing with it — so nothing was created: no account, no household, no session.',
      p2: [
        'Set ',
        { slot: 'OWNER_EMAIL' },
        " to the Google account that should own the migrated household, then sign in again. That account's first sign-in claims it. Everyone else who signs in gets their own fresh household, as normal.",
      ],
    },
  },
}

const ar: SignInCopy = {
  langSwitch: 'English',
  langSwitchFont: 'ui',
  a2: { title: 'بنكمّل على Google', body: 'هتسيب التطبيق دلوقتي وترجع هنا.' },
  a3: { title: 'مش مسجّل دخول', body: 'مفيش جلسة. سجّل دخولك عشان تكمّل.' },
  a5: { title: 'تم تسجيل الخروج', body: 'الجلسة اتقفلت على السيرفر.' },
  a4: {
    eyebrow: 'تم رفض تسجيل الدخول',
    retry: 'جرّب تسجيل الدخول تاني',
    copyLabel: 'نسخ',
    // Written Egyptian Arabic, not translated, against the same three
    // obligations as the English. Verbatim.
    content: {
      heading: 'الدخول مقفول لحد ما يتحدد مالك',
      p1: 'الديبلويمنت ده فيه بيت اتنقل من الإكسل، ولسه محدش اتحدد كمالك ليه. لو حد سجّل دخول دلوقتي هيتعمل بيت تاني فاضي يزاحمه — فمحصلش حاجة خالص: لا حساب، ولا بيت، ولا جلسة.',
      p2: [
        'حط في ',
        { slot: 'OWNER_EMAIL' },
        ' حساب Google اللي المفروض يمتلك البيت المنقول، وبعدين سجّل دخول تاني. أول مرة الحساب ده يدخل بياخده. وأي حد تاني يسجّل دخول هياخد بيته الجديد عادي.',
      ],
    },
  },
}

export const SIGN_IN_COPY: Record<Locale, SignInCopy> = { en, ar }
