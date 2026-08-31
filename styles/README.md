# Qist's design system in code

## Where it comes from

| | |
|---|---|
| **System** | Emotex Design System |
| **Source** | Claude Design project `5c0b3955-bf1e-437f-a97a-531aa36305f4` |
| **Imported** | 2026-08-31 |
| **What it is** | A dark-first system reconstructed frame-by-frame from a reference video. Qist is its second product. |

Qist is **dark only**. This is settled, not provisional — the sign-in
implementation handoff states it outright ("dark theme, which is the only theme
Qist uses"). See *Constitution conflict* below.

## Layout

```
styles/emotex/     verbatim mirror of the design system — DO NOT EDIT
styles/fonts.css   the one deviation from that mirror (see below)
styles/qist.css    everything Qist adds — the only file we edit
styles/index.css   entry point, imported once from app/layout.tsx
components/ui/     the 15 Emotex components Qist uses, ported to .tsx
```

`styles/emotex/` is byte-identical to the source, including
`emotex/tokens/fonts.css`, which the app does not import. Keeping the mirror
intact means a future design-system change is a **re-import, not a merge**, and
means every Qist-specific value is reviewable in exactly one file.

Emotex's own token architecture is three-tier and this repo keeps it:
private ramp (`--ink-*`, `--orange-*`, `--teal-*`) → role layer (`--bg-*`,
`--text-*`, `--space-*`, …) → public export (`tokens/export.css`). **A component
that reaches into the ramp is a defect, and so is a raw hex or px in a
component.**

## Deviations from the source, and why

1. **`styles/fonts.css` replaces `emotex/tokens/fonts.css`.** The original
   `@import`s Oxanium and Poppins from the Google Fonts CDN. This app runs on
   Cloudflare Workers behind a bundle-size gate; a render-blocking third-party
   request on every page load is a performance and privacy cost `next/font`
   exists to remove. The three token *names* are unchanged — only the source of
   the families moves, to self-hosted faces declared in `app/layout.tsx`.

2. **`Sheet` uses `useId()` instead of a module-level counter.** The source
   generates its `aria-labelledby` id from `let seq = 0`, which desynchronises
   between the server and client renders under SSR — which this app has and the
   design tool does not. Behaviour is otherwise identical.

3. **`ListRow` renders two branches instead of a dynamic tag.** The source
   switches its element between `<button>` and `<div>` via a variable tag name;
   written as two branches so the element types stay sound. Emitted markup is
   identical.

Everything else is a faithful port, **including things that arguably want
fixing** — see below. Silently improving a design system during import is how
code and design drift apart.

## Known defects carried over deliberately

**RTL.** Arabic is a constitutional requirement and the layout must mirror
wholesale. These physical properties do not mirror and will need the design
system's own answer, not a unilateral fix here:

| File | Line | Value | Should probably be |
|---|---|---|---|
| `ListRow.tsx` | `textAlign: "left"` | pins text to the left in Arabic | `start` |
| `Toast.tsx` | `borderLeft` | accent rule stays on the left in Arabic | `borderInlineStart` |
| `AmountDisplay.tsx` | `marginRight` | currency gap on the wrong side | `marginInlineEnd` |
| `Sheet.tsx` | `left: 0; right: 0` | harmless — symmetric | — |

**Currency placement.** `AmountDisplay` renders the currency as a **prefix**
(`$51.50`). Qist's convention is a suffixed code (`600.00 EGP`,
`−7,824,830.81 EGP`), and where that code sits on an Arabic screen is explicitly
not in plan. A Qist money component is still owed; the ported one does not fit.

**Contrast.** `--text-tertiary` measures 3.8:1 and `--text-placeholder` 4.2:1,
both below AA for the 13px metadata they carry. `--text-tertiary-aa` (4.9:1) is
declared in the source and deliberately unwired. This decision is now due,
because the data-quality treatments Qist needs are exactly that kind of metadata.

**Wallet-context defaults.** `SearchField`'s placeholder defaults to
"Search tokens". Pass your own.

## Constitution conflict — open

Principle VII ("One Visual Language for Editability") specifies navy `#1F3864`,
blue `#2E75B6`, and yellow `#FFF2CC` for editable fields on a light surface.
Qist is dark (`--bg-canvas: #141414`). That palette is a light-surface grammar
end to end, so Principle VII is **superseded rather than amended**, and the
amendment has not been made yet. Its *requirement* — that editable and read-only
be distinguishable at a glance — is untouched and still unmet: see the declared
gaps in `styles/qist.css`.

## What is deliberately not here

Seven wallet-specific components (`TokenChip`, `TokenRow`, `TokenIcon`,
`Keypad`, `PercentRow`, `SwapDivider`, `AmountField`) and `BalanceCard`, which
composes two of them. Nothing in Qist consumes them.

Also absent: the four components the sign-in screen introduced —
`StatusNotice`, `CodeToken`, `BrandLockup`, `GoogleSignInButton`. They are
specified in that screen's implementation handoff and belong with the sign-in
work, not with this import.
