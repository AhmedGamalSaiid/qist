"use client";

import { useState, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from "react";

import { Spinner } from "./Spinner";

const SIZES = {
  sm: { h: "var(--control-h-sm)", px: "var(--control-px-sm)", fs: "var(--fs-body-sm)", hit: true },
  md: { h: "var(--control-h-md)", px: "var(--control-px-md)", fs: "var(--fs-button)", hit: true },
  lg: { h: "var(--control-h-lg)", px: "var(--control-px-lg)", fs: "var(--fs-button)", hit: false },
} as const;

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "accent" | "destructive";
  size?: keyof typeof SIZES;
  block?: boolean;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  disabled = false,
  leadingIcon,
  trailingIcon,
  className = "",
  children,
  style,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const s = SIZES[size] || SIZES.md;
  const off = disabled || loading;

  const base: CSSProperties = {
    position: "relative",
    height: s.h,
    minWidth: s.h,
    padding: `0 ${s.px}`,
    display: block ? "flex" : "inline-flex",
    width: block ? "100%" : undefined,
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--control-gap)",
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-ui)",
    fontWeight: "var(--fw-regular)",
    fontSize: s.fs,
    letterSpacing: "var(--ls-body)",
    lineHeight: 1,
    cursor: off ? "not-allowed" : "pointer",
    border: "var(--bw-default) solid transparent",
    transition: "var(--t-hover),transform var(--dur-instant) var(--ease-accelerate)",
    transform: press && !off ? "var(--motion-press)" : "none",
    opacity: off ? "var(--opacity-disabled)" : 1,
    whiteSpace: "nowrap",
  };

  const v: CSSProperties =
    {
      primary: {
        background: hover && !off ? "var(--surface-inverse-hover)" : "var(--surface-inverse)",
        color: "var(--text-inverse)",
      },
      secondary: {
        background: hover && !off ? "var(--overlay-hover)" : "transparent",
        color: "var(--text-primary)",
        borderColor: hover && !off ? "var(--border-active)" : "var(--border-subtle)",
      },
      tertiary: {
        background: hover && !off ? "var(--surface-chip-hover)" : "var(--surface-chip)",
        color: "var(--text-primary)",
      },
      ghost: {
        background: hover && !off ? "var(--overlay-hover)" : "transparent",
        color: "var(--text-secondary)",
      },
      accent: {
        background: hover && !off ? "var(--accent-hover)" : "var(--accent)",
        color: "var(--accent-on)",
      },
      destructive: {
        background: "transparent",
        color: "var(--negative)",
        borderColor: hover && !off ? "var(--negative)" : "var(--negative-muted)",
      },
    }[variant] || {};

  return (
    <button
      type="button"
      className={(s.hit ? "emx-hit " : "") + className}
      disabled={off}
      aria-busy={loading || undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{ ...base, ...v, ...style }}
      {...rest}
    >
      {loading && (
        <Spinner size="var(--icon-sm)" tone="current" style={{ opacity: "var(--opacity-loader)" }} />
      )}
      {!loading && leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
}
