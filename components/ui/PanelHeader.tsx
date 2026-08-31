import { createElement, type CSSProperties, type ReactNode } from "react";

import { GradientSurface } from "./GradientSurface";

export type PanelHeaderProps = {
  title?: ReactNode;
  actions?: ReactNode;
  height?: number | string;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  drift?: boolean;
  style?: CSSProperties;
};

export function PanelHeader({
  title,
  actions,
  height = "var(--header-h)",
  headingLevel = 1,
  drift = false,
  style,
  ...rest
}: PanelHeaderProps) {
  const tag = `h${Math.min(Math.max(headingLevel, 1), 6)}`;

  return (
    <GradientSurface
      preset="header"
      drift={drift}
      radius="var(--radius-panel) var(--radius-panel) 0 0"
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        flex: "0 0 auto",
        ...style,
      }}
      {...rest}
    >
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 var(--gutter-screen) var(--space-14)",
        }}
      >
        {createElement(
          tag,
          {
            style: {
              margin: 0,
              fontFamily: "var(--font-display)",
              fontWeight: "var(--fw-thin)",
              fontSize: "var(--fs-h1)",
              letterSpacing: "var(--ls-heading)",
              color: "var(--text-primary)",
            },
          },
          title,
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
            marginBottom: "var(--space-4)",
          }}
        >
          {actions}
        </div>
      </div>
    </GradientSurface>
  );
}
