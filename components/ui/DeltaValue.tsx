import type { ComponentPropsWithoutRef } from "react";

export type DeltaValueProps = ComponentPropsWithoutRef<"span"> & {
  value?: number;
  suffix?: string;
  tone?: "neutral" | "semantic";
};

export function DeltaValue({
  value = 0,
  suffix = "%",
  tone = "neutral",
  style,
  ...rest
}: DeltaValueProps) {
  const up = value >= 0;
  const color = tone === "semantic" ? (up ? "var(--positive)" : "var(--negative)") : "inherit";
  const text = Math.abs(value).toFixed(2) + suffix;

  return (
    <span
      aria-label={`${up ? "Up" : "Down"} ${text}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-4)",
        fontFamily: "var(--font-ui)",
        fontWeight: "var(--fw-regular)",
        fontSize: "var(--fs-body-sm)",
        color,
        ...style,
      }}
      {...rest}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{
          width: "var(--icon-xs)",
          height: "var(--icon-xs)",
          flex: "0 0 auto",
          transform: up ? "none" : "var(--motion-rotate-half)",
        }}
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
