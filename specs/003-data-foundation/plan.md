# Implementation Plan: Data Foundation Migration

**Feature directory**: `specs/003-data-foundation` | **Date**: 2026-08-27 | **Spec**: [spec.md](spec.md)

**Branch**: `003-data-foundation`, cut from `fix/code-review-findings` when the
post-review corrections landed. No `before_plan` git hook is configured, so the
branch was created by hand rather than by the workflow.

**Input**: [spec.md](spec.md), [recovered-model.md](../../migration/recovered-model.md),
[sheet-dump.json](../../migration/sheet-dump.json)

## Summary

Recover the financial model that exists only as spreadsheet formulas, restate it
as tested TypeScript, and prove the restatement produces the same numbers. The
storage move to Cloudflare D1 is a consequence, not the goal.

707 formulas across 10 tabs reduce to **roughly 25 distinct computations** —
`derivations.md` currently specifies 11 functions, several owning more than one
sheet range. The exact number is established by the generated coverage matrix
(`contracts/coverage.md`, the first reconciliation task), not asserted here.
The data is
tiny — 17 accounts, 56 installments, 1 transaction, 1 snapshot — so the work is
almost entirely correctness, not scale. Four known spreadsheet defects are
corrected rather than ported (D4–D7 in the spec). Three change how a figure is
presented or computed; D7 recovers a balance the sheet stores and no formula
reads. Not all four produce a *numeric* divergence — D6's is behavioural and
shows no difference on today's data, which the reconciliation report reports as
such rather than as a `DIVERGED` line reading `difference 0`.

No user interface, no authentication flow, no deployment. The deliverable is a
database, a library of pure derivations, an importer, and a reconciliation
report that says whether the port is faithful.

**`data-model.md` is the authoritative schema definition.** An earlier draft of
this plan also listed a `contracts/schema.md`; it was never written, and two
schema documents would only drift. DDL questions are settled in
[data-model.md](data-model.md).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22+ (Wrangler 4.x refuses Node 20)

**Primary Dependencies**: Drizzle ORM, Drizzle Kit (migrations), `decimal.js`
(rate arithmetic only), Vitest

**Storage**: Cloudflare D1 (SQLite). Local development against
`better-sqlite3` via Drizzle's SQLite driver; the same schema and queries run
against D1 unchanged.

**Testing**: Vitest. Golden tests pin every figure to values captured in
`sheet-dump.json`, with the USD rate pinned to **50.2554**.

**Target Platform**: Cloudflare Workers (this feature ships no deployment; the
schema and library must be Workers-compatible — no Node built-ins outside the
importer scripts)

**Project Type**: Library + migrations + CLI scripts. No UI.

**Performance Goals**: None. Full state for one household is a few hundred rows;
correctness dominates entirely.

**Constraints**: Every monetary value is an integer minor unit. No floating
point in any monetary path. Every query scoped by household in the data-access
layer, never by handler discipline.

**Scale/Scope**: One household, 17 accounts, 56 installments, 1 transaction,
1 snapshot. Multi-tenant by construction, single-tenant in practice.

## Constitution Check

*GATE: evaluated against constitution v2.0.0, Principles I–X.*

| Principle | Status | How this design satisfies it |
|---|---|---|
| **I. Database is single source of truth** | ✅ PASS | Every recovered computation becomes a pure function evaluated at read time. Nothing derived is stored. The one exception is `snapshots`, which the principle explicitly exempts as dated historical fact — and `History` row 2, which is a live formula mirror rather than a snapshot, is excluded from import precisely to avoid persisting a derived value. |
| **II. Ledger integrity is absolute** | ✅ PASS | Integer minor units throughout with a declared scale per asset class; `decimal.js` confined to rate arithmetic. Every monetary column carries its currency (FR-047). All writes go through one all-or-nothing `atomically(statements)` primitive that is `db.batch()` on D1 and a transaction wrapper locally — settled in R9a rather than left as a caveat, because D1 has no interactive transactions and a callback API would pass local tests and fail in a Worker. CI runs the suites against both drivers. `audit_log` records actor, action, before and after. Corrections are new rows linked by `reverses_id`; no in-place edit or delete of history, with cycle prevention in the repository (a SQLite CHECK cannot express it). |
| **III. Data stays under owner's control** | ✅ PASS | No deployment in this feature. The scheduled rate fetch (D5) is an *outbound read* of a public exchange rate — no financial data leaves the account. No analytics, no telemetry, no error reporting. |
| **IV. Phone-first UX** | ➖ N/A | No UI in this feature. |
| **V. Bilingual EN/AR with real RTL** | ⚠️ PARTIAL | No UI, but account and liability names are Arabic in the source data. The data layer must preserve them byte-exact through extraction, import and reporting (FR-004). Verified by a golden test on a known Arabic account name. |
| **VI. Perceived speed is a product decision** | ➖ N/A | No UI. The aggregated-read shape is honoured structurally: a single `loadHouseholdState()` composes the full payload from one batch of queries, so the eventual UI can keep its one-round-trip contract. |
| **VII. One visual language** | ➖ N/A | No UI. |
| **VIII. Honest scope** | ✅ PASS | Four spreadsheet defects (D4–D7) are corrected rather than silently reproduced, and each is reported explicitly rather than hidden inside a tolerance. The scheduled rate fetch is recorded as deferred with its landing feature named, rather than claimed. Divergences with no current numeric difference are reported as behavioural rather than printed as `DIVERGED` lines reading `difference 0`. |
| **IX. Tenant isolation is structural** | ✅ PASS | Every domain table carries `household_id NOT NULL` with an index. Access is only through a scoped repository constructed from a household context; the raw Drizzle client is not exported from the data layer. A query written without scoping cannot be expressed against the exported surface. **Every cross-table foreign key is composite `(household_id, id)`** against a `UNIQUE(household_id, id)` parent key — scoped reads alone would not stop a transaction in household A referencing an account in household B, so the relationship carries the constraint too. |
| **X. No cutover without proven parity** | ✅ PASS | This feature *is* the parity proof. Golden tests pin to the dump's stored `value` fields — never its formatted `display` strings, which are rounded and cost the first draft of `derivations.md` tens of piastres across every installment figure (FR-046). The reconciliation report gates completion and prints minor units. Accepted divergences are listed separately from failures, so they cannot be mistaken for passes. |

**Result: no violations.** Complexity Tracking is empty.

Re-evaluated after Phase 1 design: unchanged, still passing.

## Project Structure

### Documentation (this feature)

```text
specs/003-data-foundation/
├── spec.md
├── plan.md                   # this file
├── research.md               # decisions behind the design
├── data-model.md             # entities, fields, constraints
├── quickstart.md             # how to run import + reconcile
├── contracts/
│   ├── derivations.md        # each recovered formula → function contract
│   ├── reconciliation.md     # report format and verdict rules
│   └── coverage.md           # GENERATED — formula ranges → owning derivation
└── checklists/
    └── requirements.md
```

### Source code (repository root)

```text
db/
├── schema/               Drizzle table definitions, one file per concern
│   ├── tenancy.ts        households, users, memberships, invitations
│   ├── holdings.ts       accounts, property_holdings, liabilities
│   ├── ledger.ts         transactions, installments, cards, card_payments
│   ├── rates.ts          rates
│   ├── history.ts        snapshots
│   └── audit.ts          audit_log
├── migrations/           Drizzle Kit output — never hand-edited
└── client.ts             driver setup; NOT exported past the data layer

lib/
├── money/                MinorUnits, AssetClass, scales, rounding
├── rates/                rate lookup by date, conversion
├── derive/               one pure function per recovered computation
│   ├── totals.ts         Total!* and Investment!*
│   ├── networth.ts       Net Worth!B4:B20
│   ├── installments.ts   Installments!H2:H10, unpaid-by-year
│   ├── dashboard.ts      Dashboard!B*, F*, I*
│   └── transactions.ts   monthly rollup
├── data/                 scoped repositories — the only DB surface
└── import/               sheet-dump reader, mapper, importer

scripts/
├── import.ts             sheet-dump.json → D1
└── reconcile.ts          emit the reconciliation report

tests/
├── golden/               pinned to sheet-dump.json values
├── unit/                 derivations, money, rate lookup
└── isolation/            cross-tenant negative tests
```

**Structure Decision**: `db/` and `lib/` sit at the repository root rather than
under a `src/` directory, so that feature 004's Next.js application can import
them directly without a package boundary or path rewrite. `scripts/` holds the
two entry points this feature delivers. No `app/` directory is created — this
feature ships no UI, and creating an empty shell would imply otherwise.

## Phase 0 — Research

See [research.md](research.md). Resolves: minor-unit scales per asset class,
rounding rule and its effect on reconciliation tolerance, rate-lookup
semantics, structural tenant scoping, and the shape of accepted divergences.

## Phase 1 — Design

See [data-model.md](data-model.md), [contracts/](contracts/),
[quickstart.md](quickstart.md).

## Phase 2 — Task planning approach

`/speckit-tasks` will decompose along these lines:

0. **Coverage matrix** — generate `contracts/coverage.md` from the dump:
   every formula range, its normalised shape, and the derivation that will own
   it. This comes *first*, not last, because it is what tells step 2 how many
   derivation tasks there are. Until it exists, the derivation list is a guess.
1. **Foundation** — money primitives and scales; the `atomically(statements)`
   write primitive (R9a) with its dual-driver test harness; then schema and
   first migration. Everything else depends on these.
2. **Derivations** — one task per computation named by the coverage matrix,
   each paired with its golden test. Independent of one another; parallelise
   cleanly.
3. **Import** — dump reader with the timezone preflight (FR-048), deterministic
   id derivation, entity mappers, single-transaction importer. Includes the
   `CC Payments` settings block (salary, currency, pay day, four cards) and the
   two `Liability` accounts — both were recorded as "nothing to import" in an
   earlier draft.
4. **Reconciliation** — report generator, verdict rules, divergence register,
   behavioural-divergence section, unreachable-values section.
5. **Isolation** — scoped repository surface, composite-FK constraints, and
   negative tests covering both a scoped read *and* a cross-household foreign
   key reference.

Ordering constraints:

- The coverage matrix precedes derivation decomposition — it defines the task
  list.
- Derivations must be green against golden tests before the reconciliation
  report is meaningful, because the report compares their output to the dump.
- The `atomically` primitive precedes any write path, because its
  array-not-callback shape determines how every write is written (R9a).

**Golden values are regenerated from the dump's `value` fields as part of step
2, not copied from `derivations.md` by hand.** The contract's tables are the
spec for those values, but the first draft of them was taken from `display` and
was wrong across every installment figure. A task that hand-copies expected
values reintroduces exactly that class of error; a small script that reads the
dump does not.

## Complexity Tracking

No constitutional violations. Nothing to justify.

## Revision — post-review corrections

This plan and its artifacts were reviewed against the dump after first drafting.
The review found eight blocking issues; all are resolved above and in the
artifacts, and one previously-unrecorded spreadsheet defect (D7) was found in
the process.

| # | Issue | Resolution |
|---|---|---|
| 1 | Installment and rollup goldens taken from the dump's rounded `display` strings — wrong by 20–40 piastres on every non-zero installment figure | Regenerated from `value`; FR-046 forbids `display`. The "1 EGP rounding artifact" the contract explained away was the goldens' own error and is gone — buckets now sum to `totalRemaining` exactly |
| 2 | `accounts.asset_class` CHECK rejected the two `Liability` rows the `Data` tab actually contains | Added `accounts.kind` (`asset`/`liability`); exclusion from totals is now a deliberate filter, not a string-match accident |
| 3 | `CC Payments` recorded as "nothing to import" while holding a USD salary, pay day and four cards | Imported; `income_settings.salary_currency` added — the old EGP-only typing would have read 2,250 USD as 22.50 EGP |
| 4 | Random ULIDs contradicted FR-003 idempotency and SC-006 byte-identical re-runs | Deterministic ids derived from natural keys; import made atomic |
| 5 | Constitution Check II claimed transactional writes while R9 left D1 transaction semantics an open caveat | R9a settles it: one `atomically(statements)` primitive, dual-driver CI |
| 6 | `household_id` columns and scoped reads do not prevent cross-household foreign keys | All cross-table FKs composite `(household_id, id)` |
| 7 | FR-039 mandated an automated rate fetch that the declared scope cannot build | Split: the write path and `fetch` attribution ship here, the scheduler is deferred to the first deploying feature and recorded in *Deferred* |
| 8 | D6 registered as `DIVERGED` with no differing value — the sole rate and transaction produce identical numbers | Reclassified as a behavioural divergence, `PASS` today, reported in its own section |

Also corrected: the never-written `contracts/schema.md` reference; the
unverified "25 computations" claim, now settled by a generated coverage matrix;
`savingsRate` exempted by name from the integer-minor-units rule; `created_at`
added to the three tables that lacked it; `reverses_id` cycle prevention moved
from an inexpressible SQLite CHECK to repository validation; `snapshots`
net-worth column split and qualified per D4; and a timezone preflight (FR-048)
added — the committed dump still records `America/Los_Angeles`.
