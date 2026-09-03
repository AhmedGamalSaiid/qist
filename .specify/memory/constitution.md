<!--
Sync Impact Report
==================
Version change: 2.0.0 → 3.0.0 (MAJOR)

Bump rationale: Principle VII is redefined in a backward-incompatible way.
The prior version fixed a spreadsheet-derived colour grammar (navy
`#1F3864`, blue `#2E75B6`, yellow `#FFF2CC`, and status greens/ambers/reds) as
the app's visual language; that palette is fully removed, not kept alongside
the new text. Principle VII now specifies the frozen Emotex design system:
dark-theme-only polarity, a governed component/token allowlist, structural
rules for the Qist mark, type stack, numerals/direction/money formatting,
hard-stop scope, and vendor-control overrides.

Modified principles:
  - VII. One Visual Language for Editability  →  Visual Identity Is
        Structural, Not Decorative (spreadsheet colour grammar replaced by
        the governed Emotex system; framing changed from "editability
        signal" to "structural product requirement")

Unchanged principles: I–VI, VIII, IX, X

Added sections: none

Removed sections: none

Rewritten sections: none (Technology & Deployment Constraints, Development
Workflow & Quality Gates, and Governance are unaffected by this amendment)

Templates status:
  - .specify/templates/plan-template.md ✅ compatible — Constitution Check
    gate is dynamic and does not name Principle VII's prior colour values
  - .specify/templates/spec-template.md ✅ compatible (no principle refs)
  - .specify/templates/tasks-template.md ✅ compatible (no principle refs)
  - .specify/templates/checklist-template.md ✅ compatible (no principle refs)

Historical note: specs/001-income-sheet-companion and
specs/002-credit-card-planning cite Principle VII under its v1.0.0 title
("Visual Continuity With the Sheet") and are not retroactively amended.
specs/004-multi-user-app and design/handoff/*.md already describe and
implement the Emotex system this amendment formalizes — the amendment
codifies existing, shipped practice rather than mandating new work.

Follow-up TODOs: none
-->

# Income Sheet Companion Constitution

## Core Principles

### I. The Database Is the Single Source of Truth

Cloudflare D1 holds all canonical data. Derived values — net worth, totals,
asset mix, currency conversions, due windows, overdue counts, monthly rollups —
MUST be computed at read time from base records and MUST NOT be persisted. The
single exception is a snapshot record: a dated, point-in-time artifact created
by a deliberate user action, which is a historical fact rather than a cache of
a current one. Client-side storage is a discardable session cache and is never
a source of record.

The Google Sheet becomes a frozen read-only archive at cutover and has no
runtime role thereafter. No code path reads it, writes it, or synchronises
with it.

**Rationale**: Duplicated state creates sync bugs, and a stored derived value
is a lie waiting to happen — it is correct only until one of its inputs
changes. Computing on read means a figure cannot silently drift from the
records it summarises.

### II. Ledger Integrity Is Absolute

Money MUST be stored as integer minor units, never as a floating-point number.
Rate and conversion arithmetic MUST use a decimal library, never native float
math.

All writes MUST go through a typed data-access layer and execute inside a
transaction; route handlers MUST NOT issue ad-hoc SQL. Every mutation MUST be
recorded in an append-only audit log capturing actor, action, entity, and the
before and after state.

Historical rows are immutable. Corrections are reversing entries linked to
what they correct by an explicit `reverses_id` — never in-place edits, never
deletes.

**Rationale**: This is the direct successor to v1.0.0's formula-safety
principle, and it protects the same thing. One overwritten formula could
silently corrupt every derived number in the sheet; one float rounding error,
one untracked edit, or one partial write can do exactly the same to a ledger.
An append-only history with reversing corrections means the arithmetic can
always be re-derived and audited from source.

### III. Data Stays Under the Owner's Control

The entire stack MUST run in the owner's own Cloudflare account. No third-party
analytics, no telemetry, and no error-reporting service that receives financial
values or account names. No secrets in client code. The only external identity
dependency permitted is Google OAuth for sign-in.

Backups MUST be encrypted and MUST stay in the owner's own R2 bucket. Financial
data MUST NOT be sent to any service the owner does not control.

**Rationale**: v1.0.0 achieved this by refusing to have a backend at all. That
implementation is gone; the guarantee it existed to provide is not. The hosting
provider changed — the privacy posture must not. Every external dependency
remains an attack surface and an availability risk the app does not need.

### IV. Phone-First UX

Every daily action — add a transaction, mark an installment paid, update a
rate — MUST complete in 3 taps or fewer from the home screen. Touch targets
MUST be ≥ 44px. Primary navigation is a bottom bar. Desktop is a responsive
enlargement of the phone layout, not a separate design; no feature may exist
only on desktop.

**Rationale**: Daily finance entries happen on a phone in the moment. Any
friction above three taps means entries get skipped and the data goes stale.

### V. Bilingual EN/AR With Real RTL

All UI strings live in one i18n dictionary with English and Arabic
translations; no string may be hard-coded in markup or components. Switching to
Arabic MUST flip the layout to `dir="rtl"` properly — navigation, forms,
tables, and chart legends all mirror. Numbers remain Latin digits formatted
`#,##0` and dates remain `mm/dd/yyyy` in both languages. Mixed-direction
content (Arabic account names such as "فرش" inside English UI, and vice versa)
MUST render correctly using unicode-bidi isolation.

**Rationale**: Half-done RTL (translated strings in an LTR shell) is worse than
English-only. Keeping digits and dates format-stable preserves 1:1
correspondence with the archived sheet and with the owner's own habits.

### VI. Perceived Speed Is a Product Decision

Initial application state MUST arrive in one aggregated read. Revisits MUST
render from cache before any network call. Writes MUST be optimistic: the UI
updates immediately, then visibly rolls back with an error toast if the write
fails.

Granular per-view reads ARE permitted where they are genuinely the better
design — for pagination, for lazily-opened detail, or for anything whose cost
would otherwise be paid on every cold load.

**Rationale**: v1.0.0 mandated this shape to hide Apps Script's 1–3 second
latency floor, and banned per-widget calls as a consequence. That floor is
gone; Workers are fast. The discipline is kept anyway because instant response
is a quality the app should have on its own merits, not a workaround — but the
blanket prohibition on granular reads was a workaround, and it is lifted.

### VII. Visual Identity Is Structural, Not Decorative

**1. Polarity.** The product is dark-theme only. Light polarity never appears
in any product surface. The `-ink` (dark-ink) logo variants exist for
non-product surfaces only (documents, app-store, print) and MUST NEVER be
referenced from product code.

**2. Design system.** Emotex is the Qist design system and is frozen: no
redesign, no new colour system, no new type system. Additions are permitted
only as named, rationale-carrying components or tokens proposed by design and
approved by the product owner before implementation. Approved additions to
date, implemented: components `StatusNotice`, `CodeToken`, `BrandLockup`;
token `--font-mono` (JetBrains Mono 300/400). Further additions approved in
the Home phase will be added to this list when their handoff spec lands in
`design/handoff/`; nothing is implemented before it appears there. Code MUST
NOT introduce a component or token that is not on this list.

**3. The mark.** The Qist mark never mirrors, never recolours, never
transforms, and is never reconstructed in code. It is excluded from any
global RTL icon flip — layout mirrors in RTL, the mark does not. Floor is a
32px symbol for lockups in both scripts; below 32px, symbol only, using the
small variant (16–24px). The master symbol is never used below 32px. Arabic
screens use the Arabic lockup. The bilingual lockup is marketing-only and
never appears in product. `BrandLockup` is the only sanctioned way to place
the mark and enforces these rules structurally (`dir=ltr`, `transform:none`,
no flip prop); source of truth is `public/assets/logo/`.

**4. Type.** Latin: display face Oxanium 200, UI face Poppins, per Emotex.
Arabic UI face is Alexandria, status PENDING APPROVAL by the product owner;
it is applied at the Arabic screen root by reassigning `--font-ui` and
`--font-display` and setting `--ls-caps`, `--ls-label`, `--ls-heading` to
zero. Noto Kufi Arabic appears in the logo only and never in UI copy. Arabic
UI copy is written by a native Egyptian Arabic speaker, never machine-
translated.

**5. Numerals, direction, money.** Latin digits in both languages, always.
Digits, amounts and dates are direction-isolated LTR inside Arabic; Arabic
runs are isolated inside English. A money string is one isolated LTR run in
both languages: two decimals, comma thousands, dot decimal, leading minus
using U+2212 (never a hyphen), `EGP` code trailing. Only its position
mirrors. Dates are `mm/dd/yyyy`. Gold and silver are shown in grams.
Never-recorded (`null`) and zero MUST NEVER render the same. Formatting
happens in one client-side helper; nothing arrives formatted from the
server.

**6. Scope.** "Not in plan" is a hard stop: a feature that is not in the plan
is not a control, not a disabled control, not "coming soon", and not
reserved space.

**7. Vendor controls.** A vendor's brand guidelines (currently the Google
sign-in button) override Emotex inside that control only. The control's
position in the layout follows Qist rules; its interior follows the vendor.

**Rationale**: The prior framing described the palette as inherited from the
spreadsheet — the app's design system is now Emotex, a purpose-built and
frozen system with its own governance for change, and the visual rules
around it (polarity, the mark, type, numerals/direction/money, scope, vendor
controls) are load-bearing product requirements, not aesthetic preference.

### VIII. Honest Scope

Cloudflare CAN serve a service worker, so offline support is now a deliberate
product choice rather than a platform limitation, and the documentation MUST
describe it as such rather than inheriting the old excuse.

The rule that made it a non-goal still stands: a finance app MUST NOT silently
queue a write it cannot confirm. If offline write support is ever built, it
MUST surface unconfirmed writes explicitly and MUST NOT present a queued write
as a completed one. Any limitation the app has MUST be stated plainly in the
README rather than papered over.

**Rationale**: A half-working offline mode that silently drops writes is a
data-integrity hazard. Stating a limitation honestly beats faking the
capability — and misattributing a choice to a platform constraint is its own
small dishonesty.

### IX. Tenant Isolation Is Structural

Every domain row MUST carry a `household_id`. The scoping value MUST be taken
from the authenticated session and MUST NEVER be read from a request parameter,
path segment, body field, or header.

Scoping MUST live in the data-access layer, not in individual handlers, so that
a newly written query cannot forget it. A cross-tenant read is a security
defect, not a bug.

**Rationale**: Multi-tenancy enforced by convention fails the first time
someone writes a query in a hurry. Enforced structurally, the unsafe query is
not merely discouraged — it is not expressible. This principle ranks with I–III
for waivability even though it is numbered later (see Governance).

### X. No Cutover Without Proven Parity

Migration is not complete until a reconciliation report places every figure
from the spreadsheet beside the figure the application computes, and they
agree. Ported financial logic MUST ship with golden tests pinned to real values
from the sheet dump.

A disagreement blocks cutover. It MUST NOT be resolved by adjusting the
expected value to match the code; the discrepancy must be understood and the
correct behaviour established first.

**Rationale**: The application's financial model was recovered from spreadsheet
formulas that were never written down. The only available proof that the port
is faithful is agreement with the system being replaced, checked before that
system stops being available to check against.

## Technology & Deployment Constraints

- **Framework**: Next.js 16 (App Router) — frontend and backend in one
  deployment. Route handlers and server actions are the API.
- **Host**: Cloudflare Workers via `@opennextjs/cloudflare`. Static assets via
  Workers Static Assets.
- **Database**: Cloudflare D1 (SQLite) with Drizzle ORM and Drizzle Kit
  migrations. Schema changes ship as migrations, never as manual SQL.
- **Auth**: Better Auth with Google OAuth; sessions persisted in D1.
- **Money**: integer minor units in storage; `decimal.js` (or equivalent) for
  rate arithmetic. No floats in any monetary code path (Principle II).
- **Toolchain**: Node.js 22+ is required — Wrangler 4.x refuses to run on
  Node 20.
- **Backups**: nightly D1 export to R2 on a Cron Trigger, encrypted, in the
  owner's own account (Principle III).
- **Bundle budget**: the Workers free plan caps the compressed worker at
  ~3 MiB. Measured 2026-08-27: a stock Next.js 16.3.3 app through OpenNext is
  977 KiB gzipped, leaving ~2 MiB for application code. This is a standing
  constraint, not a one-time check.
- **Secrets**: managed as Wrangler secrets; never in client code, never in the
  repository.

## Development Workflow & Quality Gates

- **Constitution Check**: every `/speckit-plan` MUST gate its design against
  Principles I–X and record violations in Complexity Tracking. Principles I,
  II, III, and IX admit no justified violations.
- **Tenant-isolation gate**: no query reaches a domain table without household
  scoping applied in the data-access layer. Any change adding a query MUST
  show where its scoping comes from, and it must be the session.
- **Money-representation gate**: no floating-point type appears in a monetary
  path — storage, arithmetic, or transport. Reviews reject float money outright
  rather than noting it.
- **Parity gate**: golden tests tied to real dumped spreadsheet values are
  green, and the reconciliation report is clean, before cutover (Principle X).
- **Bundle-size gate**: `wrangler deploy --dry-run` is run before release and
  the compressed size stays under the free-plan cap; a regression is
  investigated, not waived.
- **Migration review**: any schema change ships as a Drizzle migration with a
  tested forward path. Destructive migrations MUST state what data is lost.
- **UX gates**: each daily action demonstrably completes in ≤ 3 taps; both
  `dir="ltr"` and `dir="rtl"` layouts are checked for every new screen.
- **Perceived-speed gates**: cold load performs one aggregated read; revisit
  renders from cache before any network call; failed optimistic writes visibly
  roll back with a toast.

## Governance

This constitution supersedes all other development practices for Income Sheet
Companion. All specs, plans, tasks, and code reviews MUST verify compliance
with it; conflicts resolve in favor of the lower-numbered principle (they are
in priority order), except that Principle IX ranks immediately after III for
conflict resolution despite its number.

**Amendments**: an amendment is a documented edit to this file that states what
changed and why, bumps the version, and updates dependent templates in the same
change.

**Versioning**: semantic versioning — MAJOR for removing or redefining a
principle in a backward-incompatible way, MINOR for adding a principle or
materially expanding guidance, PATCH for clarifications and wording fixes.

**Compliance review**: the Constitution Check gate in the plan template is the
enforcement point; any violation must appear in Complexity Tracking with a
justification, and Principles I, II, III, and IX may not be waived.

**Superseded work**: specs and plans gated against an earlier version remain
valid records of what was built under it. They are not retroactively amended,
and their principle citations refer to the version current at the time.

**Version**: 3.0.0 | **Ratified**: 2026-08-17 | **Last Amended**: 2026-09-03
