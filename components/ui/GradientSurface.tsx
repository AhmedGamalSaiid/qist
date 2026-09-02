import type { ComponentPropsWithoutRef, ReactNode } from "react";

const PRESETS = {
  hero: "var(--gradient-hero)",
  header: "var(--gradient-header)",
  keypad: "var(--gradient-keypad-glow)",
  corner: "var(--gradient-corner-glow)",
} as const;

export type GradientSurfaceProps = ComponentPropsWithoutRef<"div"> & {
  preset?: keyof typeof PRESETS;
  drift?: boolean;
  radius?: string;
  children?: ReactNode;
};

export function GradientSurface({
  preset = "hero",
  drift = false,
  radius = "var(--radius-panel)",
  className = "",
  style,
  children,
  ...rest
}: GradientSurfaceProps) {
  const overlay = preset === "keypad" || preset === "corner";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        isolation: "isolate",
        borderRadius: radius,
        overflow: "hidden",
        background:
          (preset === "header" || preset === "hero") && !drift ? PRESETS[preset] : undefined,
        ...style,
      }}
      {...rest}
    >
      {overlay && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: PRESETS[preset],
            pointerEvents: "none",
            zIndex: 0,
            animation: drift
              ? "emx-drift var(--dur-atmosphere) var(--ease-standard) infinite"
              : undefined,
          }}
        />
      )}
      {drift && !overlay && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-20%",
            background: PRESETS[preset],
            pointerEvents: "none",
            animation: "emx-drift var(--dur-atmosphere) var(--ease-standard) infinite",
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1, height: "100%" }}>{children}</div>
    </div>
  );
}
