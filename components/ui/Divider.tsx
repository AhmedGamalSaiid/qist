import type { ComponentPropsWithoutRef } from "react";

export type DividerProps = ComponentPropsWithoutRef<"div"> & {
  strength?: "subtle" | "strong" | "rule";
  inset?: number;
  vertical?: boolean;
};

export function Divider({
  strength = "subtle",
  inset = 0,
  vertical = false,
  style,
  ...rest
}: DividerProps) {
  const color =
    strength === "strong"
      ? "var(--border-active)"
      : strength === "rule"
        ? "var(--white)"
        : "var(--border-subtle)";
  const opacity = strength === "rule" ? "var(--opacity-rule)" : undefined;
  const axis = vertical
    ? { width: "var(--bw-hairline)", alignSelf: "stretch", margin: `${inset}px 0` }
    : { height: "var(--bw-hairline)", margin: `0 ${inset}px` };

  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : undefined}
      style={{ background: color, opacity, ...axis, ...style }}
      {...rest}
    />
  );
}
