import { cookies } from "next/headers";

import { LOCALE_COOKIE, parseLocale } from "../../lib/i18n/locale";
import { SignInScreen } from "./SignInScreen";
import { stateFromSearch } from "./state";

/* Screen 1 of the Qist screen map. The URL contract (which query renders
   which state) is documented on `stateFromSearch`; the locale comes from the
   cookie the language switch writes, read here so the first paint is already
   in the person's language. Everything else is the client screen. */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const locale = parseLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  return <SignInScreen initialLocale={locale} initialState={stateFromSearch(params)} />;
}
