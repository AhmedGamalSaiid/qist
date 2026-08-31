import type { ComponentPropsWithoutRef } from "react";

export type SkeletonProps = ComponentPropsWithoutRef<"span"> & {
  width?: string | number;
  height?: string | number;
  radius?: string;
};

export function Skeleton({
  width = "100%",
  height = "var(--fs-body)",
  radius = "var(--radius-xs)",
  style,
  ...rest
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: radius,
        background: "var(--gradient-skeleton)",
        backgroundSize: "200% 100%",
        animation: "emx-shimmer var(--dur-shimmer) linear infinite",
        ...style,
      }}
      {...rest}
    />
  );
}
