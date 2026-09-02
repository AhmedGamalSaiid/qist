"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

export type ListRowProps = {
  title?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  value?: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
  style?: CSSProperties;
};

export function ListRow({
  title,
  description,
  leading,
  trailing,
  value,
  meta,
  onClick,
  disabled = false,
  compact = false,
  style,
  ...rest
}: ListRowProps) {
  const [hover, setHover] = useState(false);
  const interactive = !!onClick && !disabled;

  const rowStyle: CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: "var(--search-gap)",
    padding: compact ? "var(--space-12) 0" : "var(--space-18) 0",
    background: "transparent",
    border: 0,
    /* Ported verbatim. `left` is a physical property and does not mirror under
       dir="rtl" — see design/handoff/01 §8.7 and styles/RTL-DEFECTS.md. Not
       silently changed to `start`: the design system owns that decision. */
    textAlign: "left",
    color: "inherit",
    cursor: interactive ? "pointer" : "default",
    transition: "opacity var(--dur-fast) var(--ease-standard)",
    opacity: disabled
      ? "var(--opacity-disabled)"
      : hover && interactive
        ? "var(--opacity-row-hover)"
        : 1,
    ...style,
  };

  const body = (
    <>
      {leading}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: compact ? "var(--space-2)" : "var(--space-6)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: "var(--fw-thin)",
            fontSize: compact ? "var(--fs-h4)" : "var(--fs-h2)",
            letterSpacing: "var(--ls-heading)",
            color: "var(--text-primary)",
          }}
        >
          {title}
        </span>
        {description && (
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontWeight: "var(--fw-light)",
              fontSize: "var(--fs-body-sm)",
              lineHeight: "var(--lh-list)",
              color: "var(--text-secondary)",
              maxWidth: "var(--measure-list)",
            }}
          >
            {description}
          </span>
        )}
      </span>
      {value && (
        <span
          style={{
            fontFamily: "var(--font-numeric)",
            fontWeight: "var(--fw-light)",
            fontSize: "var(--fs-numeric-sm)",
            color: "var(--text-primary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
      )}
      {meta && (
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-body-sm)",
            color: "var(--text-tertiary)",
          }}
        >
          {meta}
        </span>
      )}
      {trailing}
    </>
  );

  /* The source switches its tag between <button> and <div> on the presence of
     onClick. Rendered as two branches rather than a dynamic tag so the element
     types stay sound; the emitted markup is identical. */
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={rowStyle}
        {...rest}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={rowStyle}
      {...rest}
    >
      {body}
    </div>
  );
}
