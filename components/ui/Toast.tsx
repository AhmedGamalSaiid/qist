"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type ToastProps = ComponentPropsWithoutRef<"div"> & {
  tone?: "neutral" | "success" | "error" | "warning" | "info";
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  onDismiss?: () => void;
};

export function Toast({
  tone = "neutral",
  title,
  description,
  icon,
  onDismiss,
  style,
  ...rest
}: ToastProps) {
  const accent = {
    neutral: "var(--border-active)",
    success: "var(--positive)",
    error: "var(--negative)",
    warning: "var(--warning)",
    info: "var(--info)",
  }[tone];
  const assertive = tone === "error";

  return (
    <div
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-12)",
        padding: "var(--space-14) var(--space-16)",
        background: "var(--bg-elevated)",
        borderRadius: "var(--radius-sm)",
        borderLeft: `var(--bw-thick) solid ${accent}`,
        boxShadow: "var(--shadow-panel)",
        animation: "emx-slide-up var(--dur-normal) var(--ease-emphasized)",
        maxWidth: "var(--w-toast)",
        ...style,
      }}
      {...rest}
    >
      {icon && (
        <span aria-hidden="true" style={{ color: accent, display: "flex", marginTop: "var(--space-2)" }}>
          {icon}
        </span>
      )}
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: "var(--fw-light)",
            fontSize: "var(--fs-h4)",
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
              color: "var(--text-secondary)",
            }}
          >
            {description}
          </span>
        )}
      </span>
      {onDismiss && (
        <button
          type="button"
          className="emx-hit"
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            position: "relative",
            background: "transparent",
            border: 0,
            color: "var(--text-tertiary)",
            cursor: "pointer",
            fontSize: "var(--icon-md)",
            lineHeight: 1,
            padding: "var(--space-2)",
            flex: "0 0 auto",
          }}
        >
          &#215;
        </button>
      )}
    </div>
  );
}
