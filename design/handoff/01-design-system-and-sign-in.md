# Design handoff 01 of 02 — Audit the Emotex system, then Sign in

**To**: Claude Design, with the **Emotex Design System** attached
**Brand**: the product is **Qist**. Its mark is direction **1a-B — Split Ring**
(squared Q, four-segment ring, one accent segment, tail as an integrated
continuation of the bottom segment). Selected, not yet finalized.

**Run this prompt after the logo is finalized.** The logo work's own plan calls
for validating the mark in the login screen — which is exactly what §5 below
produces. Finalize 1a-B and generate the symbol / wordmark / app-icon variants
first, then run this prompt and let sign-in serve as that validation.

**Scope note, to pre-empt a conflict:** the logo brief forbade changing the
design system, because that constraint was scoped to *logo* work. This prompt is
the opposite task — auditing and deliberately extending Emotex is §4's entire
purpose. Do not decline the extensions here by citing the logo rule.
**From**: the headless application built in Feature 004
**Status of the backend**: sign-in, session, household isolation, the aggregated
read, and card writes are implemented and passing. No screen exists.

This is **prompt 1 of 2**. The Emotex Design System already exists and is this
application's system. **This prompt does not create a design system.** It audits
Emotex against what the application actually requires, extends it where it falls
short, and then applies it to the smallest real screen.

**Prompt 2 covers the app shell and the Home screen** and consumes whatever this
prompt settles — so anything left ambiguous here gets invented twice.

Layout, composition and hierarchy are yours. This document states requirements
and states, never appearance.

---

## 1. What the application requires of the design system

These are requirements, not colour choices. Each one exists because the data
contains a distinction that will be misread if the design cannot show it.

### 1.1 Editable vs read-only — the load-bearing one

**Read-only values must be visually distinct from editable ones, everywhere in
the app**, and the distinction must survive both appearing in the same list.

This is the project constitution's Principle VII, and it is the whole reason the
system exists: "what can I edit here?" must be answerable at a glance, without
tapping to find out.

Three states, not two — they are genuinely different and are routinely collapsed:
- **Editable** — you may change this.
- **Read-only** — this is a derived or historical value; nobody may change it.
- **Not permitted for you** — a viewer-role user. The app's answer is usually to
  *show nothing at all* rather than a disabled control that fails on tap, but the
  system needs a stated position.

### 1.2 Status treatments

Installments carry three states that must be distinguishable at a glance in a
long list: **paid**, **due**, **overdue**.

### 1.3 Data-quality treatments

These have no equivalent in most design systems, and the application cannot ship
without them:

- **Staleness.** Every converted figure depends on an exchange rate with a date.
  A rate older than 7 days is stale. Three degrees — **fresh**, **dated**,
  **stale** — because *a stale rate must never be able to pass as a current one*.
  The current live data is stale at 10 days, so this is not hypothetical.
- **Not recorded ≠ zero.** The data contains values that were never recorded and
  are not recoverable. Rendering them as `0` would state a falsehood about the
  household's money. These need a treatment that is clearly *not* a number.
- **Stated vs derived balances.** A balance someone typed and a balance computed
  from movements must be distinguishable wherever a balance appears. "67,000"
  means something different under each.
- **Superseded rows.** Corrected records remain visible alongside their
  correction. A superseded value and a live one must be distinguishable.

### 1.4 Numbers and dates

This is a financial product read in two languages:

- **Tabular / lining numerals** — columns of figures must align.
- **Latin digits, `#,##0`, dates `mm/dd/yyyy` — in both English and Arabic.**
  This is fixed and non-negotiable; it preserves correspondence with the owner's
  own habits and the archived source.
- Must hold at 13 characters: `−7,824,830.81 EGP` is a real figure in this app,
  on a phone, in both directions, without truncating.

### 1.5 Brand

The Qist mark is part of the system, not decoration applied on top of it. Two
rules it has to satisfy:

- **It must not mirror under RTL.** Arabic flips the layout; a logo is not a
  layout. Everything around it moves; the mark itself does not flip.
- **It needs a position on Arabic.** Either an Arabic lockup exists, or the
  Latin mark is used in both languages deliberately. Both are legitimate; the
  gap is having no answer and discovering it mid-screen.

### 1.6 An Arabic typeface — the largest known gap

The logo work established that **Emotex currently ships no Arabic font**, so
`قسط` falls back to a system face.

That was recorded as a wordmark question. It is much larger than the wordmark.
This product is **bilingual by constitutional requirement** — English and
Egyptian Arabic, with real RTL, not translated strings in an LTR shell. Without
an Arabic face in the system, *every Arabic screen in the product* has no
typeface: account names, figures, navigation, the whole Home screen in prompt 2.

Required: an Arabic face paired with Emotex's display and text faces, covering
the same weights the Latin side uses, and holding up at the sizes financial
figures are read at. **Do not silently invent a pairing** — propose it, name it,
and say what it was chosen against.

One constraint that makes this easier than it sounds: **numerals stay Latin
digits in both languages** (§1.4), so the Arabic face never has to carry the
figure set — only the words around it.

### 1.7 Touch and direction

- **≥44px touch targets**, expressed as a component constraint rather than a note.
- **Full RTL.** Arabic flips the entire layout to `dir="rtl"` — navigation,
  forms, tables, chart legends all mirror. Not translated strings in an LTR
  shell; half-done RTL is worse than English-only.
- **Mixed direction with bidi isolation.** A liability named `فرش` sits inside an
  otherwise English list, and Latin names like `HSBC EGP` sit inside Arabic ones.

### 1.8 Optimistic writes

Writes update the UI immediately, then visibly roll back with an error toast if
the write fails. The system needs a "not yet confirmed" treatment and a rollback
toast.

---

## 2. The audit — do this first

For each requirement in §1, report which of these Emotex is:

- **Covered** — name the existing token or component that satisfies it.
- **Partial** — exists but doesn't meet the requirement; say how it falls short.
- **Missing** — needs to be added.

Include the Qist mark: is 1a-B already a component in Emotex with defined sizes,
clear space and a small/icon form, or does it still exist only as exploration
output? If the latter, promoting it into Emotex is part of this prompt's work.

Include §1.6 as its own line item. "No Arabic font" is a known answer already —
what is needed is the proposed pairing and its rationale.

Report this **before** designing anything. A short, honest gap list is more
useful than a confident redesign.

---

## 3. The palette question — surface it, do not resolve it

The project constitution currently specifies a palette: navy `#1F3864` for
headers and navigation, blue `#2E75B6` for accents, yellow `#FFF2CC` marking
every editable field, and green `#E2EFDA` / amber `#FFF3CD` / red `#FCE4E4` for
paid / due / overdue.

**The real question is not which palette wins.** Emotex is an ink ramp with a
**single orange accent**. This application needs **six** semantic roles that must
be distinguishable from one another at a glance:

1. the editable-field marker (§1.1),
2–4. paid / due / overdue, which must be three mutually distinct statuses (§1.2),
5. stale (§1.3),
6. superseded (§1.3).

One accent cannot carry three statuses. So Emotex will need semantic colour
tokens it does not currently have, whatever is decided about the constitutional
hexes. **Report what those additions should be, in Emotex's own language.**

**Do not silently pick a palette.** Report the conflict explicitly:

- Which Emotex tokens correspond to each constitutional role above.
- Where Emotex has no equivalent (the editable-field marker is the likely gap —
  most design systems have no token for "you may type here").
- Whether Emotex can satisfy §1.1 and §1.2 **on its own terms**, with its own
  colours, without the constitutional hexes.

That last question is the one that matters. The requirement is the *distinction*,
not the specific colours — the palette is one implementation of it and can be
amended. The owner decides; this prompt only has to make the choice visible
instead of burying it in a mockup.

---

## 4. Extend Emotex

Add what §2 found missing, in Emotex's own visual language — not as foreign
components bolted on. Most likely additions: the editable-field marker, the three
data-quality treatments in §1.3, and the "not permitted for you" position.

---

## 5. Screen — Sign in

The system's first application and its smoke test. One provider: Google. No
password, no email form, no sign-up flow, no alternative provider, no "forgot
password". The screen starts the OAuth redirect and reports the refusals below.

| Case | What must be conveyed |
|---|---|
| **A1** Ready | The Qist mark and the single Google sign-in action. This is the screen the mark carries — there is almost nothing else on it. |
| **A2** Redirecting | The OAuth hop is leaving the app. |
| **A3** Returned unauthenticated | The attempt did not produce a session. Nothing about why. |
| **A4** Fail-closed refusal | The deployment's owner account is not yet configured while the migrated household is unclaimed. Sign-in is refused **and nothing is created** — no user, no household. This is deliberate: silently provisioning an empty household here would create a duplicate competing with the owner's real migrated data. Needs an operator-facing explanation, not a generic error. |
| **A5** Signed out | Returning here after sign-out. The session is dead server-side. |

### A4 — the operator-facing copy

Use this. It is written against what the code actually does
(`OwnerUnconfiguredError`, thrown before user creation, persisting nothing):

> **Sign-in is closed until an owner is set**
>
> This deployment holds a household migrated from the spreadsheet, and no owner
> has been designated for it. Signing in now would create a second, empty
> household competing with it — so nothing was created: no account, no
> household, no session.
>
> Set `OWNER_EMAIL` to the Google account that should own the migrated
> household, then sign in again. That account's first sign-in claims it.
> Everyone else who signs in gets their own fresh household, as normal.

Three things this copy is doing, so it survives editing:

1. **States that nothing was written.** The reader's first fear is a half-created
   account. Answer it before anything else.
2. **Names the fix, `OWNER_EMAIL`.** This message is read by whoever deploys,
   who can act on it. A generic "contact your administrator" is useless when the
   reader *is* the administrator.
3. **Says the refusal is deliberate.** Otherwise it reads as a bug, and the
   natural next move is to retry — which will fail identically, forever.

An Arabic version is needed too, and should be written by a native speaker
rather than translated from this.

**A deliberate constraint on A3:** an expired session, a revoked session, and no
session at all are **indistinguishable by design**. The screen must not try to
tell them apart, and must not hint at which one occurred.

Both directions: EN (LTR) and AR (RTL) — the layout mirrors, the mark does not.

---

## 6. Not in this prompt

Prompt 2 covers these; designing them twice is how the two prompts end up
contradicting each other.

- The app shell, bottom bar, or header.
- The Home screen or any financial figure.
- Any screen behind authentication.

---

## 7. What comes back

1. **The §2 gap list** — covered / partial / missing, per requirement.
2. **The §3 palette reconciliation** — the conflict stated, not resolved.
3. **The extensions from §4**, in Emotex's language, as named tokens and
   components — prompt 2 will reference them by name.
4. **Sign in**, covering A1–A5, in EN and AR.
5. **The Qist mark as a system component** — sizes, clear space, and the small
   form the header will need in prompt 2.

---

## 8. Addendum — what the Emotex files actually contain

Added after §1–§7 were written, from a direct read of the Emotex project's
`readme.md` and `tokens/` on 2026-08-31. These are **findings, not design
direction** — they sharpen §2 and §3 rather than answering them.

### 8.1 The palette question is preceded by a polarity question

Emotex is **dark-first**: `--bg-canvas: #141414`, `--bg-surface: #1d1d1d`,
`--text-primary: #ffffff`. There is no light theme and no light-mode token set —
`--bg-inverse` and `--text-inverse` exist to put dark type on a light *component*
(the action tile, the primary button), not to invert the app.

The constitutional palette in §3 is the opposite polarity: a light surface with
navy headers and a pale yellow `#FFF2CC` field marker. **A pale yellow fill does
not exist on a #141414 canvas.** So §3's real first question is not *which six
colours* but *is Qist dark or light* — and the six semantic roles have to be
built in whichever polarity wins. Surface this the same way §3 asks: state it,
do not resolve it.

### 8.2 The exact state tokens Emotex has, and the collision in them

For §3's six roles, `tokens/colors.css` currently offers:

- `--positive: #6fbf9a`, `--negative: #e05b3f`, `--warning: var(--orange-300)`,
  `--info: #7d9bb5`, `--neutral: var(--ink-300)`, each with a 14% `-muted` pair.
- **Nothing at all** for editable, stale, or superseded.

One trap worth naming in the audit: `--warning` is an **alias of the accent
family** (`--orange-300`, one step off the peak accent `#ff7a33`). So "due" and
"brand accent" are currently the same colour. §1.2's three mutually distinct
statuses cannot be built without breaking that alias — which is a real change to
Emotex's one-accent identity, not a token addition.

### 8.3 The Arabic pairing would be a guess against a guess

Emotex's readme flags **both** Latin faces as substitutions: Oxanium stands in
for the squared display face and Poppins for the body grotesque, because no font
binaries were supplied — the system was reconstructed from a video. §1.6 asks for
an Arabic face paired with "Emotex's display and text faces". Those faces are
themselves placeholders.

Propose the pairing anyway, but **say what it is pinned to**, and say whether it
survives if the Latin faces are later replaced with the real ones.

### 8.4 The data-quality treatments land exactly on the failing text colour

Emotex documents two known contrast gaps: `--text-tertiary` at 3.8:1 and
`--text-placeholder` at 4.2:1, both below AA for the 13px metadata they carry.
`--text-tertiary-aa` (`#8a8a8a`, 4.9:1) is declared and **deliberately unwired**
pending a product decision.

That decision is now due, because §1.3's treatments — rate age, "not recorded",
stated-vs-derived, superseded — are metadata beside a figure, which is precisely
what tertiary text carries. A staleness warning that fails contrast is a
staleness warning that can be missed. Do not inherit this silently.

### 8.5 The mark is packaging, not drawing

Emotex has no mark of any kind — its readme states the brand is set in plain type
wherever a logo would go. Qist's mark, however, **already exists in the
application repo** at `public/assets/logo/`: `qist-symbol.svg`,
`qist-symbol-small.svg`, `qist-favicon-16.svg`, `qist-favicon-32.svg`, EN, AR and
bilingual lockups, each with an `-ink` variant.

So §2's "promote the mark into Emotex" is packaging existing assets as a system
component with sizes and clear space — not drawing anything. Note also that an
**Arabic lockup already exists**, which answers §1.5's "it needs a position on
Arabic". Confirm that answer; do not reopen it.

### 8.6 Roughly a third of the component set does not port

Wallet-specific and not applicable to Qist: `TokenChip`, `TokenRow`, `TokenIcon`,
`Keypad`, `PercentRow`, `SwapDivider`, `AmountField`.

Directly useful: `Button`, `IconButton`, `ListRow`, `ActionTile`,
`AmountDisplay`, `DeltaValue`, `Toast`, `Skeleton`, `Spinner`, `Divider`,
`BottomNav`, `PanelHeader`, `Sheet`, `SearchField`, `GradientSurface`.

Nothing needs deleting — Emotex can remain a wallet system. The point is that
Qist's vocabulary should not inherit the wallet's, and `AmountDisplay`'s stepped
lockup was built for `$51.50`, not for the 13-character `−7,824,830.81 EGP` that
§1.4 requires on a phone.

### 8.7 RTL is Missing, not Partial

Nothing in Emotex addresses `dir`, mirroring, or logical properties. In its
favour, `tokens/responsive.css` uses a **container query** on the panel's own
inline size rather than viewport media queries, which is direction-agnostic and
survives mirroring. Against it, every physical-side value in every component is
untested under `dir="rtl"`. Report §1.7 as **Missing**.
