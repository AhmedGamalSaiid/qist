# Implementation Plan: Data Foundation Migration

**Feature directory**: `specs/003-data-foundation` | **Date**: 2026-08-27 | **Spec**: [spec.md](spec.md)

**Branch**: none cut — no `before_plan` git hook is configured. Work currently
sits on `fix/code-review-findings`; a dedicated branch should be created before
implementation begins.

**Input**: [spec.md](spec.md), [recovered-model.md](../../migration/recovered-model.md),
[sheet-dump.json](../../migration/sheet-dump.json)

## Summary

Recover the financial model that exists only as spreadsheet formulas, restate it
as tested TypeScript, and prove the restatement produces the same numbers. The
storage move to Cloudflare D1 is a consequence, not the goal.

707 formulas across 10 tabs reduce to **25 distinct computations**. The data is
tiny — 17 accounts, 56 installments, 1 transaction, 1 snapshot — so the work is
almost entirely correctness, not scale. Three known spreadsheet defects are
corrected rather than ported, each producing a deliberate, recorded divergence
from the source (D4, D5, D6 in the spec).

No user interface, no authentication flow, no deployment. The deliverable is a
database, a library of pure derivations, an importer, and a reconciliation
report that says whether the port is faithful.

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
| **I. Database is single source of truth** | ✅ PASS | All 25 recovered computations become pure functions evaluated at read time. Nothing derived is stored. The one exception is `snapshots`, which the principle explicitly exempts as dated historical fact — and `History` row 2, which is a live formula mirror rather than a snapshot, is excluded from import precisely to avoid persisting a derived value. |
| **II. Ledger integrity is absolute** | ✅ PASS | Integer minor units throughout with a declared scale per asset class; `decimal.js` confined to rate arithmetic. All writes through a typed data-access layer inside a transaction. `audit_log` records actor, action, before and after. Corrections are new rows linked by `reverses_id`; no in-place edit or delete of history. |
| **III. Data stays under owner's control** | ✅ PASS | No deployment in this feature. The scheduled rate fetch (D5) is an *outbound read* of a public exchange rate — no financial data leaves the account. No analytics, no telemetry, no error reporting. |
| **IV. Phone-first UX** | ➖ N/A | No UI in this feature. |
| **V. Bilingual EN/AR with real RTL** | ⚠️ PARTIAL | No UI, but account and liability names are Arabic in the source data. The data layer must preserve them byte-exact through extraction, import and reporting (FR-004). Verified by a golden test on a known Arabic account name. |
| **VI. Perceived speed is a product decision** | ➖ N/A | No UI. The aggregated-read shape is honoured structurally: a single `loadHouseholdState()` composes the full payload from one batch of queries, so the eventual UI can keep its one-round-trip contract. |
| **VII. One visual language** | ➖ N/A | No UI. |
| **VIII. Honest scope** | ✅ PASS | Three spreadsheet defects are corrected rather than silently reproduced, and each divergence is reported explicitly rather than hidden inside a tolerance. |
| **IX. Tenant isolation is structural** | ✅ PASS | Every domain table carries `household_id NOT NULL` with an index. Access is only through a scoped repository constructed from a household context; the raw Drizzle client is not exported from the data layer. A query written without scoping cannot be expressed against the exported surface. |
| **X. No cutover without proven parity** | ✅ PASS | This feature *is* the parity proof. Golden tests pin to dump values; the reconciliation report gates completion. Accepted divergences (D6) are listed separately from failures, so they cannot be mistaken for passes. |

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
│   ├── schema.md             # table-by-table definition
│   ├── derivations.md        # each recovered formula → function contract
│   └── reconciliation.md     # report format and verdict rules
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

1. **Foundation** — money primitives and scales, then schema and first
   migration. Everything else depends on these two.
2. **Derivations** — one task per recovered computation, each paired with its
   golden test. These are independent of one another and parallelise cleanly.
3. **Import** — dump reader, entity mappers, idempotent importer.
4. **Reconciliation** — report generator, verdict rules, divergence register.
5. **Isolation** — scoped repository surface and its negative tests.

Ordering constraint: derivations must be green against golden tests before the
reconciliation report is meaningful, because the report compares their output
to the dump.

## Complexity Tracking

No constitutional violations. Nothing to justify.
