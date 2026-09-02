"use client";

import { Google_Sans } from "next/font/google";
import { useState, type ComponentPropsWithoutRef } from "react";

/* Sign in with Google — VENDOR-LOCKED. Not an Emotex component; must not be
   restyled to match Emotex. (Sign in handoff §4.)

   Google's "Sign in with Google" branding guidelines
   (developers.google.com/identity/branding-guidelines, checked 2026-09-02,
   page last updated 2026-07-07) fix this control's construction, and those
   values override Emotex's icon, colour and type rules INSIDE THIS BUTTON
   ONLY. A non-conforming button can fail Google's OAuth brand review, so this
   is a compliance requirement, not a styling preference. styles/qist.css
   sanctions the raw literals below by path.

   Dark theme, as used on --bg-canvas (Google's table, verbatim):
     fill #131314 · stroke #8E918F 1px inside · font #E3E3E3, Google Sans
     Medium, 14/20 · the standard colour "G", whose size and colour cannot be
     changed · Android & Web padding 12px before the logo, 10px after it.
   Google's page names Google Sans Medium as the button font (the Roboto
   Medium in the handoff is the superseded value); it is self-hosted through
   next/font below so no request leaves for Google Fonts at runtime.

   Qist decisions inside Google's latitude, each named in the handoff:
     - 48px control height (Google's asset is drawn at 40px) so the hit target
       clears --hit-min without touching the mark, the gap or the padding.
     - 100% width of the content column; the content is centred and the mark
       keeps its fixed size, so nothing of Google's is stretched.
     - hover lifts the fill to #1b1b1c; disabled is --opacity-disabled with the
       anatomy unchanged.

   The mark is Google's own asset (/assets/google/g-mark.png): the 20×20 "G"
   cell cropped from the shipped Theme=Dark / Show text=No / Shape=Square
   PNG at @4x (80×80 px, so it stays crisp to 4× DPR), with only the
   container's own #131314 fill pixels made transparent so the hover fill
   shows through — the raster equivalent of removing the container
   rectangle. No G pixel is altered, recoloured, rescaled non-uniformly or
   mirrored — including in RTL. Google's SVG asset is NOT used for the mark:
   its G is a Figma angular-gradient export whose fallback browsers draw as a
   black shape under blurred colour blobs (verified in Chromium against
   Google's own unmodified file), so the SVG is the one form of the mark
   that does not render as the mark.

   RTL: Google fixes the anatomy in every locale — the G at the leading edge,
   label after it. The button as a block sits inside the mirrored layout; its
   insides do not mirror. dir="ltr" on the button element carries that
   structurally (an ancestor dir="rtl" cannot reorder this subtree), and the
   Arabic label is its own dir="rtl" isolated run so it still reads as Arabic
   inside the LTR box. This overrides RTL mirroring inside this button only
   and is not a precedent for any other component. The Arabic label is
   Google's own approved string, not a Qist translation; if Google ships an
   Arabic asset, replace this composition wholesale. */

const googleSans = Google_Sans({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-google-sans",
  display: "swap",
});

export const GOOGLE_SIGN_IN_LABEL = {
  en: "Sign in with Google",
  ar: "تسجيل الدخول باستخدام Google",
} as const;

export type GoogleSignInButtonProps = Omit<ComponentPropsWithoutRef<"button">, "children" | "dir" | "type"> & {
  lang?: "en" | "ar";
};

export function GoogleSignInButton({
  lang = "en",
  disabled = false,
  style,
  className = "",
  ...rest
}: GoogleSignInButtonProps) {
  const [hover, setHover] = useState(false);
  const label = GOOGLE_SIGN_IN_LABEL[lang];

  return (
    <button
      type="button"
      dir="ltr"
      disabled={disabled}
      className={`${googleSans.variable} ${className}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        width: "100%",
        height: "48px",
        padding: "0 12px",
        background: hover && !disabled ? "#1b1b1c" : "#131314",
        border: "1px solid #8E918F",
        borderRadius: "4px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? "var(--opacity-disabled)" : 1,
        transition: "var(--t-hover)",
        ...style,
      }}
      {...rest}
    >
      {/* A plain <img>: Google's fixed 20×20 mark; nothing to optimise. */}
      <img
        src="/assets/google/g-mark.png"
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        draggable={false}
        style={{ width: "20px", height: "20px", flex: "0 0 auto", display: "block", transform: "none" }}
      />
      <span
        dir={lang === "ar" ? "rtl" : "ltr"}
        lang={lang}
        style={{
          fontFamily: "var(--font-google-sans), 'Google Sans', sans-serif",
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: "20px",
          letterSpacing: "0.25px",
          color: "#E3E3E3",
          whiteSpace: "nowrap",
          unicodeBidi: "isolate",
        }}
      >
        {label}
      </span>
    </button>
  );
}
