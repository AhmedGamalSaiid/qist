<!--
Sync Impact Report
==================
Version change: 1.0.0 → 2.0.0 (MAJOR)

Bump rationale: Principles I and III are redefined in backward-incompatible
ways. v1.0.0 required the Google Sheet to be the only canonical store and
forbade any database or external backend; both were declared un-waivable. The
project is migrating to Next.js on Cloudflare Workers with Cloudflare D1, which
v1.0.0 prohibits outright. Principles II and VI are also redefined. This is the
governance change that unblocks that migration.

Modified principles:
  - I.   Sheet Is the Single Source of Truth  →  The Database Is the Single
         Source of Truth
  - II.  Formula Safety Is Absolute  →  Ledger Integrity Is Absolute
  - III. No External Backend  →  Data Stays Under the Owner's Control
  - VI.  Perceived Speed Over Actual Speed  →  Perceived Speed Is a Product
         Decision (rationale replaced; discipline retained)
  - VII. Visual Continuity With the Sheet  →  One Visual Language for
         Editability (colour grammar retained; framing changed)
  - VIII.Honest Scope (amended: offline is now a choice, not a platform limit)

Unchanged principles: IV (Phone-First UX), V (Bilingual EN/AR With Real RTL)

Added sections:
  - IX. Tenant Isolation Is Structural
  - X.  No Cutover Without Proven Parity

Removed sections: none

Rewritten sections:
  - Technology & Deployment Constraints (new stack)
  - Development Workflow & Quality Gates (allowlist/sheet-safety gates replaced
    by tenant-isolation, money-representation, parity and bundle-size gates)
  - Governance (un-waivable set now I, II, III, IX)

Templates status:
  - .specify/templates/plan-template.md ✅ compatible — its Constitution Check
    gate is dynamic ("Gates determined based on constitution file"); plans must
    now gate against Principles I–X, especially I, II, III and IX
  - .specify/templates/spec-template.md ✅ compatible (no principle references)
  - .specify/templates/tasks-template.md ✅ compatible (no principle references)
  - .specify/templates/checklist-template.md ✅ compatible (no principle refs)

Historical note: specs/001-income-sheet-companion and
specs/002-credit-card-planning were written and gated against v1.0.0 and cite
principles by their v1.0.0 numbers and titles. Those documents are a record of
the Apps Script application and are NOT retroactively amended. Principle
numbers I–VIII were deliberately held stable to keep those citations legible;
IX and X were appended rather than inserted.

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

### VII. One Visual Language for Editability

The app uses a consistent colour grammar: navy `#1F3864` for headers and
navigation, blue `#2E75B6` for accents, and yellow `#FFF2CC` marking every
editable field. Installment status uses green `#E2EFDA` (paid), amber `#FFF3CD`
(due), and red `#FCE4E4` (overdue). Read-only values MUST be visually distinct
from editable ones everywhere in the app.

**Rationale**: This palette began as the spreadsheet's, and the owner reads it
fluently — that fluency is worth preserving even though the sheet is no longer
something they open. It is now the app's own design system rather than a mirror
of another artifact. Its real work is making "what can I edit here?" answerable
at a glance.

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

**Version**: 2.0.0 | **Ratified**: 2026-08-17 | **Last Amended**: 2026-08-27
