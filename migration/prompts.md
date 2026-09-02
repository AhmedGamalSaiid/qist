# Spec-kit prompts for the Cloudflare migration

Run these in Claude Code, in this order. Step 0 is yours; the rest are commands.

---

## Step 0 — before any spec-kit command (you)

1. `git add -A && git commit` the current working tree.
2. Apps Script editor → run `dumpModel()` (from `appsscript/dump.gs`).
3. Save the JSON it produces to `migration/sheet-dump.json` and commit it.

`/speckit-plan` cannot write `data-model.md` without this. Everything else is
blocked behind it.

---

## Step 1 — `/speckit-constitution`

Paste the block below as the argument.

```
Amend the constitution to v2.0.0 (MAJOR — Principles I, II, III and VI are
redefined in backward-incompatible ways). Reason: the project is migrating off
Google Apps Script and Google Sheets onto Next.js running on Cloudflare Workers
with Cloudflare D1 as the data store. Principles I and III forbid exactly that
and the Governance section says they may not be waived, so the constitution has
to change before any spec or plan for the migration can pass its own gate.

REPLACE Principle I "Sheet Is the Single Source of Truth" with
"The Database Is the Single Source of Truth": Cloudflare D1 holds all canonical
data. Derived values — net worth, totals, asset mix, currency conversions, due
windows, overdue counts, monthly rollups — are computed at read time from base
records and MUST NOT be persisted. The only exception is an explicit snapshot
record, which is a dated point-in-time artifact, not a cache. Client storage is
a discardable session cache and never a source of record. The Google Sheet
becomes a frozen read-only archive on cutover and has no runtime role.

REPLACE Principle II "Formula Safety Is Absolute" with "Ledger Integrity Is
Absolute": money is stored as integer minor units, never as a float, and rate
arithmetic uses a decimal library. Writes go through a typed data-access layer
inside a transaction — no ad-hoc SQL from route handlers. Every mutation is
recorded in an append-only audit log with actor, before and after. Corrections
are reversing entries linked by an explicit reverses_id, never in-place edits
or deletes of historical rows. Preserve the spirit of the old principle: the
derived layer must be impossible to corrupt.

REPLACE Principle III "No External Backend" with "Data Stays Under the Owner's
Control": the entire stack runs in the owner's own Cloudflare account. No
third-party analytics, no telemetry, no error-reporting service that receives
financial values, and no secrets in client code. The only external identity
dependency is Google OAuth for sign-in. Backups are encrypted and stay in the
owner's own R2 bucket. The old rationale still holds — the hosting provider
changed, the privacy posture must not.

REWRITE Principle VI "Perceived Speed Over Actual Speed": the old rationale was
Apps Script's 1-3 second floor, which is gone. Keep the discipline anyway —
one aggregated read for initial state, cached render on revisit, optimistic
writes that visibly roll back on failure — but justify it as UX quality rather
than as latency compensation. Explicitly permit granular reads where they are
genuinely better, since the old blanket prohibition on per-widget calls was an
Apps Script workaround.

KEEP Principles IV (Phone-First UX), V (Bilingual EN/AR With Real RTL) and
VIII (Honest Scope) intact — they are platform-independent. Update VIII's
specifics: Cloudflare CAN serve a service worker, so the "no offline mode"
constraint is now a deliberate choice rather than a platform limit. State it
that way, and keep the rule that a finance app must never silently queue a
write it cannot confirm.

AMEND Principle VII "Visual Continuity With the Sheet": keep the colour grammar
(navy #1F3864, blue #2E75B6, yellow #FFF2CC for editable, green/amber/red for
installment status) because the owner reads it fluently, but drop the framing
that it mirrors a sheet the user still opens. It is now the app's own design
system.

ADD Principle IX "Tenant Isolation Is Structural": every domain row carries a
household_id. The scoping value is taken from the authenticated session and
NEVER from a request parameter, path segment or body field. Scoping lives in
the data-access layer, not in individual handlers, so a new query cannot
forget it. Cross-tenant reads are a security defect, not a bug.

ADD Principle X "No Cutover Without Proven Parity": the migration is not
complete until a reconciliation report puts every figure from the spreadsheet
beside the figure the application computes and they agree. Ported financial
logic ships with golden tests pinned to real values from the sheet dump. A
disagreement blocks cutover; it is never resolved by adjusting the expected
value to match the code.

Rewrite the "Technology & Deployment Constraints" section for the new stack:
Next.js 16 App Router on Cloudflare Workers via @opennextjs/cloudflare, D1 with
Drizzle ORM and Drizzle Kit migrations, Better Auth with Google OAuth, Node.js
22+ required for Wrangler, nightly D1 export to R2. Note the measured budget:
a stock Next.js 16.3.3 app is 977 KiB gzipped against the free plan's ~3 MiB
worker cap, so bundle size is a standing constraint to re-check each phase.

Rewrite "Development Workflow & Quality Gates": replace the sheet-safety and
allowlist gates with a tenant-isolation gate (no query without household
scoping), a money-representation gate (no floats in monetary paths), a parity
gate (golden tests green before cutover) and a bundle-size gate
(wrangler deploy --dry-run stays under the cap). Keep the UX gates: 3 taps,
both LTR and RTL checked for every screen.

Update the Governance section so the may-not-be-waived list points at the new
Principles I, II, III and IX. Include the Sync Impact Report comment at the top
of the file as the existing version does, and propagate any needed changes to
the templates under .specify/templates/.
```

---

## Step 2 — `/speckit-specify`

Run only after the constitution reads v2.0.0. Paste as the argument.

```
Feature: migrate the data foundation off Google Sheets onto Cloudflare D1.
Short name: data-foundation.

Scope is the data layer ONLY. This feature ships NO user interface. It is done
when a D1 database exists whose every computed figure provably equals the
spreadsheet's, and not before. The Next.js application, authentication and the
screen port are a separate, later feature that depends on this one.

Context. The application's financial logic is not in this repository. api.gs is
almost entirely readers: it copies out numbers that the spreadsheet's own
formulas already computed in Dashboard!A3:C12, Total!A1:L2, Installments!G1:H10
and elsewhere. Net worth, asset mix by class, per-currency EGP conversion, the
3/6/12-month due windows, overdue counts and monthly transaction rollups all
live in cells nothing here can read. Only the nine formulas in Code.gs:88-97
are version-controlled. migration/sheet-dump.json is the recovered model: every
formula, value, number format, data-validation rule, conditional-format rule
and input-yellow cell, extracted by appsscript/dump.gs. Treat it as the
authoritative specification of current behaviour.

In scope:
- A normalized D1 schema, multi-tenant from the start. Households, users,
  memberships with roles, and invitations. Every domain table carries
  household_id. Domain tables cover accounts, transactions, installments,
  liabilities, rates, cards, card payments, snapshots, income settings and an
  audit log.
- Rates keep full history rather than only the latest value, so a past net
  worth can be recomputed at the rate that applied at the time. The sheet
  cannot do this today.
- Every recovered formula reimplemented as a pure, typed, unit-tested function.
  Derived values are computed, never stored.
- Money as integer minor units throughout; decimal arithmetic for rates.
- A one-time importer from migration/sheet-dump.json into D1.
- A reconciliation report placing every spreadsheet figure beside the computed
  figure with an explicit pass/fail per line.
- Golden tests pinned to real values from the dump.

Out of scope: any UI, any React, authentication flows and session handling,
deployment, and the Apps Script app, which keeps running untouched until 004
cuts over.

Unresolved, and I want it raised as a clarification rather than assumed. The
sheet stores each account's amount as a hand-edited current balance. A ledger
system derives balances from transactions instead. Deriving is the more correct
design and makes the transaction log meaningful rather than decorative, but it
requires an opening balance per account and every movement actually being
recorded, which is a real change in daily habit. Both options are defensible.
Do not pick one silently — surface it.

Success: the reconciliation report is clean, every ported formula has a golden
test tied to a real dumped value, and no query can reach another household's
rows.
```
