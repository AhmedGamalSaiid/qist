import type { ReactNode } from "react";

import { Spinner } from "./Spinner";

/* StatusNotice — proposed Emotex addition, approved for the sign-in phase
   (Sign in handoff §2.1).

   A persistent, in-flow message block that is part of the page composition —
   as opposed to Toast (floating, capped at --w-toast, slide-up, dismissible,
   one description string). Two tones, each a whole anatomy rather than a
   colour:

   neutral — a short state report inside the screen composition. Filled
             container, accent rule on the inline-start edge (mirrors with the
             layout), title row + one short body line. `busy` renders a
             --icon-sm Spinner pinned to the END of the title row — never
             inline with the body copy, where at the leading edge it reads as a
             list bullet, unmistakably so in RTL. role="status", polite.
   blocked — page-level refusal content: no fill, no border, no accent bar.
             Eyebrow (uppercase caption in --warning) → heading → hairline rule
             → as many paragraphs as the approved copy has. role="alert",
             announced assertively, because it reports a refusal.

   Both tones mirror wholly through logical properties: no RTL stylesheet, no
   direction-conditional branch. Recurs beyond Sign in — Home's "no rate for
   this date" hard error and the multiple-membership disclosure are `blocked`. */

export type StatusNoticeProps = {
  tone?: "neutral" | "blocked";
  /** Required in `neutral`; optional in `blocked`. */
  title?: string;
  /** `blocked` only; ignored by `neutral`. Rendered uppercase in --warning. */
  eyebrow?: string;
  /** `neutral` only; renders the spinner slot. */
  busy?: boolean;
  /** `neutral`: one short line. `blocked`: the approved paragraphs. */
  children?: ReactNode;
  className?: string;
};

export function StatusNotice({
  tone = "neutral",
  title,
  eyebrow = "",
  busy = false,
  children,
  className,
}: StatusNoticeProps) {
  if (tone === "blocked") {
    return (
      <div
        role="alert"
        className={className}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-14)", width: "100%" }}
      >
        {eyebrow ? (
          <span
            className="emx-caption"
            style={{
              textTransform: "uppercase",
              letterSpacing: "var(--ls-caps)",
              color: "var(--warning)",
            }}
          >
            {eyebrow}
          </span>
        ) : null}
        {title ? (
          <h2 className="emx-h2" style={{ margin: 0, color: "var(--text-primary)", textWrap: "pretty" }}>
            {title}
          </h2>
        ) : null}
        <div aria-hidden="true" style={{ height: "var(--bw-hairline)", background: "var(--border-subtle)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-14)" }}>{children}</div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        width: "100%",
        padding: "var(--space-14) var(--space-16)",
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-sm)",
        borderInlineStart: "var(--bw-thick) solid var(--border-active)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
        <span className="emx-h4" style={{ color: "var(--text-primary)" }}>
          {title}
        </span>
        {busy ? (
          <span style={{ marginInlineStart: "auto", display: "inline-flex", flex: "0 0 auto" }}>
            <Spinner size="var(--icon-sm)" />
          </span>
        ) : null}
      </div>
      <div className="emx-body-sm" style={{ color: "var(--text-secondary)", textWrap: "pretty" }}>
        {children}
      </div>
    </div>
  );
}
