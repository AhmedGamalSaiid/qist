import type { CSSProperties } from "react";

/* BrandLockup — proposed Emotex addition, approved for the sign-in phase
   (Sign in handoff §2.3).

   The Qist mark as a component. Its purpose is to make the frozen logo rules
   mechanically impossible to break rather than documented somewhere a
   developer will not be reading six screens from now:

   (a) The 32px floor. `symbol >= 32` resolves to a lockup file; below it, to a
       symbol-only file. The branch is inside the component, so a caller cannot
       produce a lockup below the floor at all. The master symbol drawing is
       never used below 32px — the small variant, drawn for 16–24px, is.
   (b) Polarity. `light` = light ink for dark grounds (the plain files);
       `dark` = dark ink for light grounds (the `-ink` files). The orange
       accent is identical in both and is never recoloured.
   (c) Script. `en` / `ar` select the finished lockups. The bilingual lockup is
       marketing-only: there is deliberately no prop value that resolves to it.
   (d) NEVER MIRRORS. There is deliberately no mirror / flip / rtl / direction
       prop. Three structural guards, all kept on purpose:
         1. The mark is an <img> referencing an external SVG. A global
            `[dir="rtl"] svg { transform: scaleX(-1) }` rule — the single most
            likely way this gets broken — cannot reach inside an <img>.
         2. The wrapper pins dir="ltr" + transform:none, and the image pins
            transform:none, so a cascading flip is overridden at both levels.
         3. The wrapper carries data-brand-mark="qist" so a future global icon
            rule can exclude it explicitly and a lint rule can find every
            instance.

   All eleven assets under /assets/logo are production-final: never edited,
   recoloured, redrawn, or re-exported. */

export type BrandScript = "en" | "ar";
export type BrandPolarity = "light" | "dark";

export type BrandLockupProps = {
  /** Which wordmark. */
  script?: BrandScript;
  /** `light` = light ink for dark backgrounds; `dark` = dark ink for light backgrounds. */
  polarity?: BrandPolarity;
  /** The height of the SYMBOL in px (16–160), not of the lockup. The lockup's dimensions derive from it. */
  symbol?: number;
  className?: string;
  style?: CSSProperties;
};

export const BRAND_ASSET_DIR = "/assets/logo";
export const BRAND_SYMBOL_FLOOR = 32;
export const BRAND_SYMBOL_MIN = 16;
export const BRAND_SYMBOL_MAX = 160;

/* Lockup artboards are 353 × 160 (EN) and 367 × 160 (AR); the symbol occupies
   120 of the 160 units, and clear space is already inside the artboard. */
const LOCKUP_ARTBOARD_H = 160;
const LOCKUP_SYMBOL_H = 120;
const LOCKUP_RATIO: Record<BrandScript, number> = { en: 353 / 160, ar: 367 / 160 };

export type ResolvedBrandMark = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Clear space around a symbol-only render (symbol / 6). Zero for lockups — it is inside the artboard. */
  pad: number;
  kind: "lockup" | "symbol";
};

/** The file-resolution table from the handoff, as a pure function so it can be tested without a DOM. */
export function resolveBrandMark(input: {
  script?: BrandScript;
  polarity?: BrandPolarity;
  symbol?: number;
}): ResolvedBrandMark {
  const script: BrandScript = input.script === "ar" ? "ar" : "en";
  const dark = input.polarity === "dark";
  const requested = Number.isFinite(input.symbol) ? (input.symbol as number) : 64;
  const symbol = Math.min(BRAND_SYMBOL_MAX, Math.max(BRAND_SYMBOL_MIN, requested));
  const alt = script === "ar" ? "قسط" : "Qist";

  if (symbol >= BRAND_SYMBOL_FLOOR) {
    const height = symbol * (LOCKUP_ARTBOARD_H / LOCKUP_SYMBOL_H);
    return {
      src: `${BRAND_ASSET_DIR}/qist-lockup-${script}${dark ? "-ink" : ""}.svg`,
      alt,
      width: height * LOCKUP_RATIO[script],
      height,
      pad: 0,
      kind: "lockup",
    };
  }

  /* Below the floor, light polarity uses the small drawing. No `-ink` small
     variant was shipped, so dark polarity below the floor falls back to the
     master ink drawing — which contradicts rule (a). Flagged in the handoff
     (§2.3 note, §9.3), not silently patched here; the combination does not
     occur on Sign in, where every panel is dark. */
  return {
    src: `${BRAND_ASSET_DIR}/${dark ? "qist-symbol-ink" : "qist-symbol-small"}.svg`,
    alt,
    width: symbol,
    height: symbol,
    pad: symbol / 6,
    kind: "symbol",
  };
}

export function BrandLockup({
  script = "en",
  polarity = "light",
  symbol = 64,
  className,
  style,
}: BrandLockupProps) {
  const mark = resolveBrandMark({ script, polarity, symbol });

  return (
    <span
      dir="ltr"
      data-brand-mark="qist"
      className={className}
      style={{
        display: "inline-flex",
        flex: "0 0 auto",
        padding: `${mark.pad}px`,
        direction: "ltr",
        transform: "none",
        ...style,
      }}
    >
      {/* A plain <img>: a fixed-size brand SVG; next/image adds nothing and its loader is not configured for Workers. */}
      <img
        src={mark.src}
        alt={mark.alt}
        width={mark.width}
        height={mark.height}
        draggable={false}
        style={{
          display: "block",
          width: `${mark.width}px`,
          height: `${mark.height}px`,
          transform: "none",
        }}
      />
    </span>
  );
}
