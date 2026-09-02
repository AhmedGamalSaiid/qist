"use client";

import { Alexandria } from "next/font/google";
import { useState, type CSSProperties, type ReactNode } from "react";

import { GoogleSignInButton } from "../../components/google/GoogleSignInButton";
import { BrandLockup, Button, CodeToken, Skeleton, StatusNotice } from "../../components/ui";
import { authClient } from "../../lib/auth/client";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  directionOf,
  otherLocale,
  type Locale,
} from "../../lib/i18n/locale";
import { OWNER_EMAIL_LITERAL, SIGN_IN_COPY, type Slotted } from "./copy";
import type { SignInState } from "./state";

/* Screen 1 — Sign in. Built to the implementation handoff; the five states
   are one skeleton (54px status-bar reserve → mark region → bottom-pinned
   action region) with state-specific contents. Nothing here may suggest
   setup, onboarding, or account creation (handoff §7). */

/* Alexandria — PENDING APPROVAL. The Arabic UI mockup face, applied at this
   screen's root only by reassigning --font-ui / --font-display on the Arabic
   panel (handoff §1.1, §3.2). Deliberately NOT a token: it is not in
   styles/fonts.css, and styles/qist.css keeps the --font-ar-pending slot
   visible until the pairing is approved or replaced. */
const alexandriaPending = Alexandria({
  subsets: ["arabic", "latin"],
  weight: ["200", "300", "400"],
  variable: "--font-alexandria",
  display: "swap",
});

/* Where a successful sign-in lands. Home is screen 2 and is still in design;
   `/` is its future address, not a route that exists today. */
const SIGN_IN_CALLBACK_URL = "/";
const SIGN_IN_ERROR_URL = "/sign-in";

export type SignInScreenProps = {
  initialLocale: Locale;
  initialState: SignInState;
};

export function SignInScreen({ initialLocale, initialState }: SignInScreenProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [state, setState] = useState<SignInState>(initialState);
  const copy = SIGN_IN_COPY[locale];
  const dir = directionOf(locale);
  const isArabic = locale === "ar";

  function switchLanguage() {
    const next = otherLocale(locale);
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    setLocale(next);
  }

  async function signIn() {
    setState("redirecting");
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: SIGN_IN_CALLBACK_URL,
      errorCallbackURL: SIGN_IN_ERROR_URL,
    });
    /* The hop never left the app (the initiation request itself failed), so
       there is no session: A3, which by design says nothing about why. The
       handoff does not design this case — flagged in the report. */
    if (error) setState("unauthenticated");
  }

  /* The panel. Emotex's .emx-panel caps the composition at --panel-w-max and
     centres it (handoff §6); the canvas is --bg-canvas. Arabic panels take
     dir="rtl", the pending Arabic face, and zeroed Latin tracking (decision 13). */
  const panelVars = {
    "--font-ar-pending": `var(--font-alexandria), "Alexandria", system-ui, sans-serif`,
    ...(isArabic
      ? {
          "--font-ui": "var(--font-ar-pending)",
          "--font-display": "var(--font-ar-pending)",
          "--ls-caps": "0em",
          "--ls-label": "0em",
          "--ls-heading": "0em",
        }
      : {}),
  } as CSSProperties;

  const panelStyle: CSSProperties = {
    ...panelVars,
    height: "100dvh",
    background: "var(--bg-canvas)",
    display: "flex",
    flexDirection: "column",
  };

  const languageSwitch = (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <Button variant="ghost" size="sm" onClick={switchLanguage}>
        <span
          dir={directionOf(otherLocale(locale))}
          lang={otherLocale(locale)}
          style={{
            unicodeBidi: "isolate",
            fontFamily: copy.langSwitchFont === "arabicPending" ? "var(--font-ar-pending)" : "var(--font-ui)",
          }}
        >
          {copy.langSwitch}
        </span>
      </Button>
    </div>
  );

  const statusBarReserve = <div style={{ flex: "0 0 auto", height: "54px" }} />;

  if (state === "refused") {
    return (
      <main className={`emx-root emx-panel ${alexandriaPending.variable}`} dir={dir} lang={locale} style={panelStyle}>
        {statusBarReserve}
        <div style={{ flex: "0 0 auto", padding: "0 var(--gutter-screen)" }}>
          <BrandLockup script={locale} polarity="light" symbol={32} />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            padding: "var(--space-32) var(--gutter-screen) 0",
            overflow: "auto",
          }}
        >
          {copy.a4.content ? (
            <StatusNotice tone="blocked" eyebrow={copy.a4.eyebrow} title={copy.a4.content.heading}>
              <Paragraph>{copy.a4.content.p1}</Paragraph>
              <Paragraph>{renderSlotted(copy.a4.content.p2, copy.a4.copyLabel)}</Paragraph>
            </StatusNotice>
          ) : (
            <StatusNotice tone="blocked" eyebrow={copy.a4.eyebrow}>
              <AwaitingArabicCopy copyLabel={copy.a4.copyLabel} />
            </StatusNotice>
          )}
        </div>
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-12)",
            padding: "var(--space-24) var(--gutter-screen) var(--space-32)",
          }}
        >
          <Button variant="secondary" size="lg" block onClick={() => void signIn()}>
            {copy.a4.retry}
          </Button>
          {languageSwitch}
        </div>
      </main>
    );
  }

  const notice =
    state === "redirecting" ? (
      <StatusNotice tone="neutral" busy title={copy.a2.title}>
        {copy.a2.body}
      </StatusNotice>
    ) : state === "unauthenticated" ? (
      <StatusNotice tone="neutral" title={copy.a3.title}>
        {copy.a3.body}
      </StatusNotice>
    ) : state === "signedOut" ? (
      <StatusNotice tone="neutral" title={copy.a5.title}>
        {copy.a5.body}
      </StatusNotice>
    ) : null;

  return (
    <main className={`emx-root emx-panel ${alexandriaPending.variable}`} dir={dir} lang={locale} style={panelStyle}>
      {state === "ready" ? (
        /* A1 alone carries the atmosphere. It mirrors with the layout —
           anchored top-right in LTR, top-left in RTL (decision 4). Reduced
           motion is Emotex's: --dur-atmosphere collapses to 0 there. */
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: isArabic ? "var(--gradient-corner-glow-rtl)" : "var(--gradient-corner-glow)",
            opacity: "var(--opacity-glow-soft)",
            animation: "emx-drift var(--dur-atmosphere) var(--ease-standard) infinite",
          }}
        />
      ) : null}
      {statusBarReserve}
      {/* The mark is out of flow (handoff §1.1 pattern; styles/qist.css): a
          full-width layer centred on 45.5% of the panel height, A1's own
          centre, so A2/A3/A5 entering below cannot move it. */}
      <div
        className="qist-anchored"
        style={{ ["--anchor-y" as string]: "45.5%", paddingInline: "var(--gutter-screen)" } as CSSProperties}
      >
        <BrandLockup script={locale} polarity="light" symbol={64} />
      </div>
      <div
        className="qist-holds-bottom"
        style={{
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          gap: state === "ready" ? "var(--space-12)" : "var(--space-16)",
          padding: "0 var(--gutter-screen) var(--space-32)",
          position: "relative",
        }}
      >
        {notice}
        <GoogleSignInButton lang={locale} disabled={state === "redirecting"} onClick={() => void signIn()} />
        {state === "redirecting" ? null : languageSwitch}
      </div>
    </main>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return (
    <p className="emx-body" style={{ margin: 0, color: "var(--text-secondary)", textWrap: "pretty" }}>
      {children}
    </p>
  );
}

/** Interpolates the OWNER_EMAIL slot as a live CodeToken, wherever the language put it. */
function renderSlotted(segments: Slotted, copyLabel: string): ReactNode {
  return segments.map((segment, i) =>
    typeof segment === "string" ? (
      segment
    ) : (
      <CodeToken key={i} value={OWNER_EMAIL_LITERAL} copyLabel={copyLabel} />
    ),
  );
}

/* AWAITING ARABIC COPY — mockup scaffolding, not shipped UI. Stands in for
   A4's Arabic heading and two paragraphs at the line counts the layout
   expects (handoff §5: heading 2 lines, p1 ~5 lines, p2 ~4 lines plus the
   token). The live CodeToken sits in its real position so the slot's inline
   behaviour is already proven. Replace this whole block with the written
   Arabic; do not translate the English. */
function AwaitingArabicCopy({ copyLabel }: { copyLabel: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-16)" }}>
      <span
        className="emx-caption"
        style={{
          alignSelf: "flex-start",
          padding: "3px 8px",
          border: "var(--bw-hairline) dashed var(--warning)",
          borderRadius: "var(--radius-xs)",
          color: "var(--warning)",
          fontFamily: "var(--font-ui)",
          whiteSpace: "nowrap",
        }}
      >
        <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
          AWAITING ARABIC COPY
        </span>
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        <Skeleton width="100%" height="26px" />
        <Skeleton width="62%" height="26px" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Skeleton width="100%" />
        <Skeleton width="100%" />
        <Skeleton width="100%" />
        <Skeleton width="100%" />
        <Skeleton width="46%" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Skeleton width="34%" />
          <CodeToken value={OWNER_EMAIL_LITERAL} copyLabel={copyLabel} />
          <Skeleton width="18%" />
        </div>
        <Skeleton width="100%" />
        <Skeleton width="100%" />
        <Skeleton width="100%" />
        <Skeleton width="72%" />
      </div>
    </div>
  );
}
