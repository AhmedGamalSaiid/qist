"use client";

import { useState, type ComponentPropsWithoutRef, type CSSProperties } from "react";

export type IconButtonProps = Omit<ComponentPropsWithoutRef<"button">, "size"> & {
  /* Required, not optional: every icon-only control in this system takes an
     accessible label. See the design system's accessibility contract. */
  label: string;
  size?: number | string;
  variant?: "ghost" | "solid" | "outline";
  active?: boolean;
};

export function IconButton({
  label,
  size = "var(--control-h-md)",
  variant = "ghost",
  active = false,
  disabled = false,
  className = "",
  children,
  style,
  ...rest
}: IconButtonProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const box = typeof size === "number" ? `${size}px` : size;

  const v: CSSProperties = {
    ghost: {
      background: hover && !disabled ? "var(--overlay-hover)" : "transparent",
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
    },
    solid: {
      background: hover && !disabled ? "var(--surface-inverse-hover)" : "var(--surface-inverse)",
      color: "var(--text-inverse)",
    },
    outline: {
      background: "transparent",
      color: "var(--text-primary)",
      border: "var(--bw-default) solid var(--border-subtle)",
    },
  }[variant];

  return (
    <button
      type="button"
      className={`emx-hit ${className}`}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        position: "relative",
        width: box,
        height: box,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        border: "var(--bw-default) solid transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? "var(--opacity-disabled)" : 1,
        transition: "var(--t-hover),transform var(--dur-instant) var(--ease-accelerate)",
        transform: press && !disabled ? "var(--motion-press)" : "none",
        ...v,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
