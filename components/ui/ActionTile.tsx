"use client";

import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react";

export type ActionTileProps = Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  label: ReactNode;
  icon?: ReactNode;
};

export function ActionTile({
  label,
  icon,
  onClick,
  disabled = false,
  style,
  ...rest
}: ActionTileProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        flex: 1,
        minWidth: 0,
        height: "var(--tile-h)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--control-gap)",
        background: hover && !disabled ? "var(--surface-tile-hover)" : "var(--surface-tile)",
        border: 0,
        borderRadius: "var(--radius-sm)",
        color: "var(--text-inverse)",
        fontFamily: "var(--font-ui)",
        fontWeight: "var(--fw-light)",
        fontSize: "var(--fs-body-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? "var(--opacity-disabled)" : 1,
        transition: "var(--t-hover),transform var(--dur-instant) var(--ease-accelerate)",
        transform: press && !disabled ? "var(--motion-press)" : "none",
        ...style,
      }}
      {...rest}
    >
      <span aria-hidden="true" style={{ display: "flex", height: "var(--icon-lg)", alignItems: "center" }}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
