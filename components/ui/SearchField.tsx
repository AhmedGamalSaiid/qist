"use client";

import { useState, type CSSProperties } from "react";

export type SearchFieldProps = {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  /* Default is the design system's wallet-context string. Every Qist use
     should pass its own label and placeholder. */
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  style?: CSSProperties;
};

export function SearchField({
  value,
  onChange,
  label,
  placeholder = "Search tokens",
  disabled = false,
  autoFocus = false,
  style,
  ...rest
}: SearchFieldProps) {
  const [focus, setFocus] = useState(false);

  return (
    <div
      role="search"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--search-gap)",
        height: "var(--search-h)",
        padding: "0 var(--gutter-screen)",
        background: "var(--bg-input)",
        borderRadius: "var(--radius-sm)",
        border: `var(--bw-default) solid ${focus ? "var(--border-active)" : "transparent"}`,
        transition: "var(--t-hover)",
        opacity: disabled ? "var(--opacity-disabled)" : 1,
        ...style,
      }}
      {...rest}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
        style={{
          width: "var(--icon-lg)",
          height: "var(--icon-lg)",
          color: "var(--text-primary)",
          flex: "0 0 auto",
        }}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.2-3.2" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={label || placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: 0,
          outline: "none",
          color: "var(--text-primary)",
          fontFamily: "var(--font-ui)",
          fontWeight: "var(--fw-light)",
          fontSize: "var(--fs-body-lg)",
        }}
      />
    </div>
  );
}
