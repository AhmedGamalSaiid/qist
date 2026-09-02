"use client";

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type SheetProps = {
  open?: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  height?: string;
  /* false pins the sheet open — for irreversible work in flight. */
  dismissible?: boolean;
  style?: CSSProperties;
};

export function Sheet({
  open = false,
  onClose,
  title,
  children,
  height = "var(--sheet-h-md)",
  dismissible = true,
  style,
  ...rest
}: SheetProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  const restore = useRef<HTMLElement | null>(null);
  /* The design system generates this id from a module-level counter. That
     desynchronises between the server and client renders under SSR, which this
     app has and the design tool does not; useId is React's own answer and is
     stable across both. Behaviour is otherwise unchanged. */
  const id = useId();

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const first = node && node.querySelector<HTMLElement>(FOCUSABLE);
    (first || node)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (!items.length) {
        e.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge || !node.contains(document.activeElement)) {
        e.preventDefault();
        /* Non-empty by the early return above; optional-called to satisfy
           this repo's noUncheckedIndexedAccess. Behaviour is unchanged. */
        (e.shiftKey ? items[items.length - 1] : items[0])?.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
      restore.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20 }}>
      <div
        aria-hidden="true"
        onClick={dismissible ? onClose : undefined}
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--overlay-scrim)",
          backdropFilter: "blur(var(--blur-scrim))",
          cursor: dismissible ? "pointer" : "default",
          animation: "emx-fade-in var(--dur-normal) var(--ease-standard)",
        }}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={title ? id : undefined}
        aria-label={title ? undefined : "Sheet"}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-modal)",
          borderRadius: "var(--radius-panel) var(--radius-panel) 0 0",
          boxShadow: "var(--shadow-sheet)",
          overflow: "hidden",
          outline: "none",
          animation: "emx-slide-up var(--dur-slow) var(--ease-emphasized)",
          ...style,
        }}
        {...rest}
      >
        {title && (
          <div
            id={id}
            style={{
              padding: "var(--space-18) var(--gutter-screen) var(--space-8)",
              fontFamily: "var(--font-display)",
              fontWeight: "var(--fw-thin)",
              fontSize: "var(--fs-h2)",
              letterSpacing: "var(--ls-heading)",
              color: "var(--text-primary)",
            }}
          >
            {title}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
