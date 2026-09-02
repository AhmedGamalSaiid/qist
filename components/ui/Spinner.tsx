import type { ComponentPropsWithoutRef } from "react";

export type SpinnerProps = ComponentPropsWithoutRef<"span"> & {
  size?: "md" | number | string;
  tone?: "primary" | "accent" | "muted" | "current";
  label?: string;
};

export function Spinner({
  size = "md",
  tone = "primary",
  label = "Loading",
  style,
  ...rest
}: SpinnerProps) {
  const box =
    size === "md" ? "var(--spinner-md)" : typeof size === "number" ? `${size}px` : size;
  const color =
    tone === "accent"
      ? "var(--accent)"
      : tone === "muted"
        ? "var(--text-tertiary)"
        : tone === "current"
          ? "currentColor"
          : "var(--text-primary)";

  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: "inline-block",
        width: box,
        height: box,
        flex: "0 0 auto",
        borderRadius: "var(--radius-full)",
        border: `var(--loader-bw) solid ${color}`,
        borderTopColor: "transparent",
        animation: "emx-spin var(--dur-slow) linear infinite",
        ...style,
      }}
      {...rest}
    />
  );
}
