import type { ComponentPropsWithoutRef, ReactNode } from "react";

const SIZES = {
  xl: "var(--fs-money-xl)",
  lg: "var(--fs-money-lg)",
  md: "var(--fs-money-md)",
} as const;

export type AmountDisplayProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  value?: string | number;
  /* NOTE: rendered as a PREFIX, before the figure. Qist's convention is a
     suffixed code ("600.00 EGP", "−7,824,830.81 EGP"), and where that code sits
     on an Arabic screen is explicitly not in plan. This component is ported
     as the design system ships it; a Qist money component is still owed. */
  currency?: ReactNode;
  size?: keyof typeof SIZES | number | string;
  tone?: "inherit" | "accent" | "muted";
  placeholder?: boolean;
};

export function AmountDisplay({
  value = "0",
  currency = "$",
  size = "lg",
  tone = "inherit",
  placeholder = false,
  style,
  ...rest
}: AmountDisplayProps) {
  const s = String(value);
  const dot = s.indexOf(".");
  const whole = dot === -1 ? s : s.slice(0, dot);
  const frac = dot === -1 ? "" : s.slice(dot);
  const box =
    typeof size === "number"
      ? `${size}px`
      : (SIZES[size as keyof typeof SIZES] ?? size);
  const color =
    tone === "accent" ? "var(--accent)" : tone === "muted" ? "var(--text-tertiary)" : undefined;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        fontFamily: "var(--font-numeric)",
        fontWeight: "var(--fw-thin)",
        letterSpacing: "var(--ls-numeric)",
        lineHeight: "var(--lh-money)",
        color,
        opacity: placeholder ? "var(--opacity-placeholder)" : 1,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
      {...rest}
    >
      {currency && (
        <span
          style={{
            fontSize: `calc(${box} * var(--money-symbol-scale))`,
            marginRight: "var(--money-symbol-gap)",
          }}
        >
          {currency}
        </span>
      )}
      <span style={{ fontSize: box }}>{whole}</span>
      {frac && <span style={{ fontSize: `calc(${box} * var(--money-decimal-scale))` }}>{frac}</span>}
    </div>
  );
}
