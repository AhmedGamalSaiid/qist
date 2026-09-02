"use client";

import { useEffect, useRef, useState } from "react";

/* CodeToken — proposed Emotex addition, approved for the sign-in phase
   (Sign in handoff §2.2).

   An inline literal for values a person must reproduce EXACTLY (OWNER_EMAIL).
   Set in --font-mono — the one token the phase adds, see styles/fonts.css —
   because Emotex's two proportional faces do not disambiguate `_`, I/l, 0/O.

   The whole chip is the copy affordance; there is no separate icon, which at
   this size would compete with the literal it sits beside. Copying flashes
   the chip confirmed for 1600ms — surface --accent-muted, border --accent —
   with no layout change, no size change, no text change, no tooltip, no
   toast: the chip sits mid-sentence, and anything that changes its width
   reflows the paragraph under the reader's eye. A visually-hidden polite live
   region announces "{value} copied", then clears. If the clipboard API is
   unavailable or refused, the copy fails silently and the confirmation does
   not fire; the literal stays selectable by hand.

   Direction: dir="ltr" + unicode-bidi:isolate, structurally. A code literal
   is always LTR, including inside Arabic copy, and isolation stops it from
   reordering the Arabic sentence around it. */

export const CODE_TOKEN_CONFIRM_MS = 1600;

export type CodeTokenProps = {
  /** The literal. Rendered verbatim. */
  value: string;
  /** Builds the accessible name `"{copyLabel} {value}"`. Localize it. */
  copyLabel?: string;
};

const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

export function CodeToken({ value, copyLabel = "Copy" }: CodeTokenProps) {
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    let written = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        written = true;
      }
    } catch {
      written = false; // refused or unavailable: fail silently, no confirmation.
    }
    if (!written) return;

    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      timer.current = null;
    }, CODE_TOKEN_CONFIRM_MS);
  }

  return (
    <>
      <button
        type="button"
        dir="ltr"
        aria-label={`${copyLabel} ${value}`}
        onClick={() => void copy()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: "24px",
          padding: "0 var(--space-6)",
          margin: "0 var(--space-2)",
          verticalAlign: "-5px",
          background: copied ? "var(--accent-muted)" : "var(--bg-elevated)",
          color: "var(--text-primary)",
          border: `var(--bw-default) solid ${copied ? "var(--accent)" : hover ? "var(--border-active)" : "var(--border-subtle)"}`,
          borderRadius: "var(--radius-xs)",
          fontFamily: "var(--font-mono)",
          fontWeight: "var(--fw-regular)",
          fontSize: "13px",
          letterSpacing: "0.01em",
          lineHeight: 1,
          whiteSpace: "nowrap",
          cursor: "pointer",
          unicodeBidi: "isolate",
          direction: "ltr",
          transition: "var(--t-hover)",
        }}
      >
        {value}
      </button>
      <span aria-live="polite" style={visuallyHidden}>
        {copied ? `${value} copied` : ""}
      </span>
    </>
  );
}
