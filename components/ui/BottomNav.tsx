"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

export type NavItemSpec = {
  id: string;
  label: string;
  icon?: ReactNode;
};

export type BottomNavProps = {
  items?: NavItemSpec[];
  active?: string;
  onSelect?: (id: string) => void;
  action?: ReactNode;
  label?: string;
  style?: CSSProperties;
};

export function BottomNav({
  items = [],
  active,
  onSelect,
  action,
  label = "Primary",
  style,
  ...rest
}: BottomNavProps) {
  return (
    <nav
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "stretch",
        height: "var(--nav-h)",
        background: "var(--bg-nav)",
        borderTop: "var(--bw-hairline) solid var(--border-hairline)",
        ...style,
      }}
      {...rest}
    >
      <ul
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          gap: "var(--space-4)",
          padding: "0 var(--space-8)",
          margin: 0,
          listStyle: "none",
        }}
      >
        {items.map((it) => (
          <li key={it.id} style={{ display: "flex" }}>
            <NavItem item={it} active={active === it.id} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      {action}
    </nav>
  );
}

function NavItem({
  item,
  active,
  onSelect,
}: {
  item: NavItemSpec;
  active: boolean;
  onSelect?: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onSelect && onSelect(item.id)}
      style={{
        width: "var(--nav-item)",
        height: "var(--nav-item)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: 0,
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        color: active
          ? "var(--text-primary)"
          : hover
            ? "var(--text-secondary)"
            : "var(--text-tertiary)",
        transition: "color var(--dur-fast) var(--ease-standard)",
      }}
    >
      {item.icon}
    </button>
  );
}
