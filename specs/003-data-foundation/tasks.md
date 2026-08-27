---
description: "Task list for Data Foundation Migration"
---

# Tasks: Data Foundation Migration

**Input**: Design documents from `specs/003-data-foundation/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Test tasks are included and are **mandatory** for this feature. SC-002
requires every ported calculation to assert against a real extracted value, US1
acceptance scenario 3 requires the same, and Principle X forbids cutover without
proven parity. Tests are the deliverable here, not an optional extra.

**Organization**: Tasks are grouped by user story. US1 is the whole parity proof
and is the MVP; US2–US4 add integrity, rate history and isolation on top of it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths are given in every task

## Path Conventions

Per plan.md, `db/` and `lib/` sit at the **repository root**, not under `src/`,
so feature 004's Next.js app can import them without a package boundary. No
`app/` directory is created — this feature ships no UI.

## Before you start

Three rules from the post-review revision that change how these tasks are done.
Ignoring any one of them reintroduces a defect this feature already found and
fixed:

1. **Expected values come from the dump's `value` field, never `display`**
   (FR-046). `display` is rounded for presentation. Goldens are *generated* by
   `scripts/goldens.ts`, never hand-copied from a contract table.
2. **Writes take an array of statements, never a callback** (R9a). D1 has no
   interactive transactions; a callback API passes every local test and fails
   only in a Worker.
3. **The coverage matrix comes first** (Phase 2), because it defines how many
   derivation tasks actually exist. The `~25 computations` figure is unverified
   until it is generated.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization. No feature logic.

- [ ] T001 Create the directory structure from plan.md at the repository root: `db/schema/`, `db/migrations/`, `lib/money/`, `lib/rates/`, `lib/derive/`, `lib/data/`, `lib/import/`, `scripts/`, `tests/golden/`, `tests/unit/`, `tests/isolation/`, `tests/atomicity/`
- [ ] T002 Initialize `package.json` at repository root with `"engines": { "node": ">=22" }` and dependencies: `drizzle-orm`, `drizzle-kit`, `decimal.js`, `better-sqlite3`, `vitest`, `typescript`, `wrangler@4`
- [ ] T003 [P] Create `tsconfig.json` at repository root with `strict: true`, `noUncheckedIndexedAccess: true`, target ES2022, module resolution suited to Workers
- [ ] T004 [P] Create `.nvmrc` at repository root containing `22` — the repo default is still 20 and Wrangler 4 refuses to run on it (quickstart.md prerequisites)
- [ ] T005 [P] Create `drizzle.config.ts` at repository root pointing at `db/schema/` with the SQLite dialect and `db/migrations/` as output
- [ ] T006 [P] Create `vitest.config.ts` at repository root defining **two projects over the same test bodies**: `local` (better-sqlite3) and `d1` (Wrangler local D1). R9a requires both; a single-project config cannot catch a D1-only failure
- [ ] T007 Add npm scripts to `package.json`: `db:generate`, `db:migrate:local`, `import`, `reconcile`, `goldens:generate`, `coverage:check`, `test:golden`, `test:unit`, `test:isolation`, `test:atomicity`, `lint:money` — matching the commands quickstart.md V1–V9 tell the owner to run

**Checkpoint**: `npm install` succeeds on Node 22 and `npx tsc --noEmit` passes on an empty project.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The coverage matrix, money primitives, the write primitive, and the
schema. Every user story depends on all of it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Dump access and the coverage matrix (plan.md Phase 2, step 0)

- [ ] T008 Implement the typed dump reader in `lib/import/dump.ts`: parse `migration/sheet-dump.json`, expose sheets by index and cells by A1 reference. It MUST expose the `value` field and MUST NOT expose `display` on the money path at all — an API that cannot return `display` is what prevents FR-046 being violated by accident
- [ ] T009 [P] Implement the timezone preflight in `lib/import/preflight.ts` (FR-048): read the dump's recorded timezone and extraction timestamp, and throw unless both the source timezone and `Africa/Cairo` place the extraction on the same calendar date. The committed dump still records `America/Los_Angeles`, so this is a live check, not a formality
- [ ] T010 [P] Implement the dump completeness check in `lib/import/validate.ts` (FR-002): refuse a truncated or incomplete dump and state exactly what was missing
- [ ] T011 Implement the formula normaliser in `scripts/coverage.ts`: read every formula-bearing cell from the dump, replace row/column indices with placeholders so repeated per-row formulas collapse to one shape, and group by shape
- [ ] T012 Extend `scripts/coverage.ts` to emit `specs/003-data-foundation/contracts/coverage.md` with columns `range`, `count`, `shape`, `owner`, `reason`, `verdict`, per the *Coverage matrix* section of [contracts/reconciliation.md](contracts/reconciliation.md)
- [ ] T013 Run `npm run coverage:generate` and fill the `owner` column for every row, assigning each formula range to a derivation from [contracts/derivations.md](contracts/derivations.md) or marking it `EXCLUDED` with a reason. Commit the result as `specs/003-data-foundation/contracts/coverage.md`
- [ ] T014 Implement `coverage:check` in `scripts/coverage-check.ts`: regenerate the matrix, diff it against the committed file, and fail if `sum(count)` does not equal the dump's own formula total counted from the dump. This is quickstart V8

> **T013 is a decision point, not a mechanical step.** It is where the
> "~25 computations" claim becomes a measured number. If the matrix shows
> formula ranges with no owning derivation, **stop and add derivations to the
> contract** before continuing to Phase 3 — the derivation task list below is
> sized from `derivations.md`'s current 11 functions and may need to grow.

### Money primitives

- [ ] T015 [P] Define `MinorUnits`, `AssetClass` and the per-class scale table in `lib/money/types.ts` (R1): EGP 2, USD 2, GOLD 3 (milligrams), SILVER 3, and the USD rate scale 4
- [ ] T016 [P] Implement half-up rounding to a target class's minor unit in `lib/money/round.ts` (R2), applied at each conversion and never deferred. Rounding must be away from zero on negatives — `Net Worth!B19` is negative
- [ ] T017 Implement `convert(quantityMinor, fromClass, rate)` in `lib/money/convert.ts` per [contracts/derivations.md](contracts/derivations.md), with `EGP → EGP` as identity (depends on T015, T016)
- [ ] T018 [P] Implement the `lint:money` static check in `scripts/lint-money.ts`: reject `number` division, `parseFloat`, and float literals in `lib/money/`, `lib/rates/` and `lib/derive/`. It MUST exempt `monthlyRollup().savingsRate` **by name** — widening the rule to allow ratios generally would let a monetary float through (quickstart V7)

### Rate lookup

- [ ] T019 Implement rate lookup by date in `lib/rates/lookup.ts` (R3): return the rate in force on a given date, and throw `MissingRateError` when the date precedes every recorded rate. Never substitute zero, and never reach forward to a later rate (FR-019, FR-043)

### The write primitive

- [ ] T020 Implement `atomically(statements: Statement[]): Promise<void>` in `lib/data/atomically.ts` (R9a): `db.batch()` on D1, a `better-sqlite3` transaction wrapper over the same array locally. It MUST take an array and MUST NOT accept a callback — the array signature is what makes a read-then-decide-then-write cycle inside the atom unexpressible
- [ ] T021 Create `db/client.ts` with driver setup for both better-sqlite3 and D1. The raw Drizzle client MUST NOT be exported past `lib/data/` (Principle IX)

### Schema

- [ ] T022 [P] Define `households`, `users`, `memberships`, `invitations` in `db/schema/tenancy.ts` per [data-model.md](data-model.md)
- [ ] T023 [P] Define `accounts`, `property_holdings`, `liabilities` in `db/schema/holdings.ts`. `accounts` carries **`kind` (`asset` | `liability`)** alongside `asset_class` — the `Data` tab's dropdown permits `Liability` and two rows use it (D7). `property_holdings` and `liabilities` each carry `created_at`
- [ ] T024 [P] Define `transactions`, `installments`, `cards`, `card_payments`, `income_settings` in `db/schema/ledger.ts`. `income_settings` carries **`salary_currency`** — the stored salary is 2250 **USD**, and an EGP-only column would import it as 22.50 EGP (FR-047)
- [ ] T025 [P] Define `rates` in `db/schema/rates.ts` with `UNIQUE(household_id, asset_class, as_of)`, append-only, and an explicit `scale` column
- [ ] T026 [P] Define `snapshots` in `db/schema/history.ts` with `net_worth_excl_installments_minor` NOT NULL and `net_worth_incl_installments_minor` nullable. **Neither is named plain `net_worth_minor`** — D4 forbids an unqualified net-worth figure, and a column name is a presentation
- [ ] T027 [P] Define `audit_log` in `db/schema/audit.ts` recording actor, action, before and after (Principle II, FR-016)
- [ ] T028 Add `UNIQUE(household_id, id)` to every domain table and make **every cross-table foreign key composite `(household_id, id)`** across `db/schema/tenancy.ts`, `db/schema/holdings.ts`, `db/schema/ledger.ts`, `db/schema/rates.ts`, `db/schema/history.ts` and `db/schema/audit.ts`. Scoped reads alone cannot stop a transaction in household A referencing an account in household B (Principle IX). Depends on T022–T027
- [ ] T029 Add the single-row CHECK constraints in the schema files that own each table: `currency = 'USD' ⟹ rate_id IS NOT NULL` and `reverses_id != id` in `db/schema/ledger.ts`; `balance_mode` consistency in `db/schema/holdings.ts`; `source = 'app' ⟹ net_worth_incl_installments_minor IS NOT NULL` in `db/schema/history.ts`. Add the partial `UNIQUE(household_id, reverses_id) WHERE reverses_id IS NOT NULL` in `db/schema/ledger.ts`. **Cycle prevention is not here** — a SQLite CHECK cannot follow a foreign key to another row (see T076)
- [ ] T030 Generate the initial migration with `npm run db:generate` into `db/migrations/`, then apply it with `npm run db:migrate:local`. Generated migrations are never hand-edited — regenerate instead

### Deterministic identifiers

- [ ] T031 Implement deterministic id derivation in `lib/import/ids.ts`: `id = ulid_from(sha256(household_id ‖ table ‖ natural_key)[0:16])`, laid into Crockford base-32 so ids stay 26 characters. Use the natural-key table in [data-model.md](data-model.md). Random ULIDs cannot satisfy SC-006 (FR-003)

### Golden value generation

- [ ] T032 Implement `scripts/goldens.ts`: read every expected value named by [contracts/derivations.md](contracts/derivations.md) from the dump's `value` fields, convert to minor units with half-up rounding, and emit `tests/golden/expected.generated.ts`. Goldens are generated, never hand-copied — the first draft of the contract was built from `display` and was wrong by 20–40 piastres on every non-zero installment figure

**Checkpoint**: Coverage matrix committed and `coverage:check` green; schema migrated; `atomically` passes a trivial round-trip on both drivers; `scripts/goldens.ts` emits values matching the tables in `derivations.md`.

---

## Phase 3: User Story 1 - Trust that the migration did not change my numbers (Priority: P1) 🎯 MVP

**Goal**: Restate every recovered spreadsheet computation as a tested pure
function, import the dump faithfully and idempotently, and produce a
reconciliation report that says line by line whether the port is faithful.

**Independent Test**: Run the import against the extracted dump, then generate
the reconciliation report. Satisfied when every line passes, every ported
calculation has a test pinned to a real extracted value, and a second import run
changes nothing.

### Tests for User Story 1 ⚠️

> **Write these first and confirm they FAIL before implementing the derivations.**
> Every expected value is imported from `tests/golden/expected.generated.ts`
> (T032). A test that inlines a literal expected value is rejected in review —
> that is exactly how the `display` defect entered.

- [ ] T033 [P] [US1] Golden test for `convert` in `tests/golden/convert.test.ts` — the four conversion rows in `derivations.md`, plus `EGP → EGP` identity
- [ ] T034 [P] [US1] Golden test for `holdingsByClass` in `tests/golden/holdings.test.ts` — both partitions, all four classes, and an assertion that accounts of `kind = 'liability'` are excluded
- [ ] T035 [P] [US1] Golden test for `shortTermLiabilities`, `totalOfAll` and `investmentTotal` in `tests/golden/totals.test.ts` (`8010900`, `10971520`, `28005919`)
- [ ] T036 [P] [US1] Golden test for `netWorth` in `tests/golden/networth.test.ts` — all six fields, including the negative `includingInstallments` at `-782483081`
- [ ] T037 [P] [US1] Golden test for `installmentSummary` in `tests/golden/installments.test.ts` — all nine fields. **Assert no field ends in `00`** except `totalScheduled` and `overdue`: ten of the 56 installments carry fractional EGP, so a round number elsewhere is the signature of the `display` bug
- [ ] T038 [P] [US1] Golden test for `unpaidByYear` in `tests/golden/unpaid-by-year.test.ts` — the 21-year spine, plus the cross-check that buckets sum to exactly `821460520`, equal to `installmentSummary.totalRemaining`. Neither gets a tolerance (FR-029)
- [ ] T039 [P] [US1] Golden test for `assetMix` in `tests/golden/asset-mix.test.ts` — five classes, with `USD` under a ±2 piastre tolerance and the rest exact
- [ ] T040 [P] [US1] Golden test for `transactionEgp` in `tests/golden/transaction-egp.test.ts` — `502554` for the single 100 USD transaction, computed at the pinned rate rather than a live one
- [ ] T041 [P] [US1] Golden test for `monthlyRollup` in `tests/golden/monthly-rollup.test.ts` — income `502554` (not `502600`), `savingsRate` `1.0` at Aug 2026 compared with an explicit epsilon, and `null` (never `0`) for every zero-income month
- [ ] T042 [P] [US1] Golden test for `EDATE` month-end clamping in `tests/unit/edate.test.ts` — 31 Jan + 1 month → 28/29 Feb. The 3/6/12-month windows disagree at month ends if this is wrong
- [ ] T043 [P] [US1] Arabic round-trip test in `tests/golden/arabic.test.ts` (FR-004, quickstart V4): the liability named `فرش` at 60,000 must come back byte-exact through extraction, import and reporting
- [ ] T044 [P] [US1] Missing-rate test in `tests/unit/missing-rate.test.ts` (quickstart V6): converting on a date earlier than any recorded rate throws `MissingRateError` and never substitutes zero
- [ ] T045 [P] [US1] Timezone preflight test in `tests/unit/preflight.test.ts`: a dump whose timezone and timestamp straddle a date boundary is refused with a reason; the committed dump passes
- [ ] T046 [US1] Import idempotency test in `tests/golden/import-idempotent.test.ts` (quickstart V2, SC-006): import twice, assert identical row counts **and identical ids**, and assert the expected counts — 17 accounts (15 asset, 2 liability), 3 property holdings, 7 liabilities, 56 installments, 1 transaction, 1 snapshot, 3 rates, 4 cards, 1 income settings row, 0 card payments
- [ ] T047 [US1] Import completeness regression tests in `tests/golden/import-completeness.test.ts`: assert 17 accounts not 15 (the two `Liability` rows survive), 4 cards exist, and `income_settings.salary_currency = 'USD'`. Each of these was silently dropped by an earlier draft of the data model

### Implementation for User Story 1 — derivations

- [ ] T048 [P] [US1] Implement `holdingsByClass`, `shortTermLiabilities`, `totalOfAll` and `investmentTotal` in `lib/derive/totals.ts`. Liability-kind accounts are excluded by **filtering on `kind`**, not by relying on a class string failing to match a SUMIFS (D7, FR-045)
- [ ] T049 [P] [US1] Implement `netWorth` in `lib/derive/networth.ts` returning **both** figures, neither named plain "net worth" (D4, FR-036, FR-037)
- [ ] T050 [P] [US1] Implement `installmentSummary` in `lib/derive/installments.ts`, taking `today` as an explicit parameter — never a clock (R8)
- [ ] T051 [P] [US1] Implement `unpaidByYear` in `lib/derive/installments.ts` over calendar-year buckets, not rolling windows
- [ ] T052 [P] [US1] Implement `assetMix` in `lib/derive/dashboard.ts` combining both partitions per class
- [ ] T053 [P] [US1] Implement `transactionEgp` in `lib/derive/transactions.ts` using the rate pinned by `transaction.rate_id`, not the current rate (D6, FR-042)
- [ ] T054 [P] [US1] Implement `monthlyRollup` in `lib/derive/transactions.ts` taking its month list as a parameter rather than hard-coding the sheet's forward 24-month spine
- [ ] T055 [US1] Implement `EDATE` month-end clamping in `lib/derive/dates.ts` and wire it into the 3/6/12-month windows in `lib/derive/installments.ts` (depends on T050)

### Implementation for User Story 1 — import

- [ ] T056 [P] [US1] Implement entity mappers in `lib/import/mappers.ts`: `Data!A:E` → accounts (uppercasing `Gold`/`Silver`, mapping `Liability` to `kind`, never to `asset_class`), `Net Worth!B9:B11` → property holdings, `Total!I4:J10` → liabilities, `Installments!A:E` → installments, `Transactions!A:H` → transactions, `Rates!A:C` → rates
- [ ] T057 [P] [US1] Implement the `CC Payments` mapper in `lib/import/mappers-cards.ts`: `H7:H10` → 4 cards, `I2:I4` → one `income_settings` row (`salary_minor` 225000, `salary_currency` `'USD'`, `pay_day` 27). Read the settings block to the right of the payment columns — reading only A–F discards all of it
- [ ] T058 [P] [US1] Implement the snapshot mapper in `lib/import/mappers-history.ts`: import `History` rows 4+ only. **Row 2 is excluded** — it is a live formula mirror, not a snapshot, and importing it persists a derived value (FR-012). `History!G` is the excluding-installments figure; the including-installments column imports NULL
- [ ] T059 [US1] Implement the importer in `lib/import/importer.ts`: preflight (T009) → validate (T010) → map → derive ids (T031) → write via a single `atomically` call (T020). All tables or none (FR-005a). Depends on T056–T058
- [ ] T060 [US1] Implement the CLI entry point in `scripts/import.ts` taking `--dump <path>`, reporting per-table row counts on success and the specific failure on refusal

### Implementation for User Story 1 — reconciliation

- [ ] T061 [P] [US1] Implement the report line model and verdict rules in `lib/reconcile/verdict.ts`: `PASS`, `PASS (tolerance)`, `DIVERGED`, `FAIL`. Tolerance is ±`conversions` piastres, where `conversions` counts **conversions that actually occurred**, not conversion terms present in the formula — a figure whose conversion inputs are all zero has `conversions 0` and must reconcile exactly
- [ ] T062 [P] [US1] Implement report rendering in `lib/reconcile/render.ts`: figures printed in **minor units** taken from the dump's `value`, never re-rounded, with an optional EGP rendering in parentheses. A report printing `109715.20` cannot show a one-piastre disagreement, which is the only kind it exists to catch
- [ ] T063 [P] [US1] Implement the *Behavioural divergences* section in `lib/reconcile/divergences.ts`: registered divergences with no current numeric difference are listed here and excluded from the verdict tally. **None of the four registered divergences prints a `DIVERGED` line on today's data** — a `DIVERGED` line reading `difference 0` is a defect in the report
- [ ] T064 [P] [US1] Implement the *Unreachable values* section in `lib/reconcile/unreachable.ts` (D7, FR-044/FR-045): list every value the source stores that no formula reads — `Data!D13` at 600 EGP and `Data!D14` at 0. Zeros are listed too, so an empty section is unambiguous. An unreachable value absent from this section is a `FAIL`
- [ ] T065 [US1] Implement coverage enforcement in `lib/reconcile/coverage.ts`: every formula-bearing cell in the matrix must appear on the report or be explicitly excluded with a reason. A coverage gap is a `FAIL` of the report itself
- [ ] T066 [US1] Implement the report generator in `lib/reconcile/report.ts` composing T061–T065, grouped by source tab in sheet order, with a summary counting each verdict and stating the completion gate outcome
- [ ] T067 [US1] Implement the CLI entry point in `scripts/reconcile.ts`, exiting non-zero on any `FAIL` so the completion gate is machine-enforced (FR-009)
- [ ] T068 [US1] Implement snapshot handling in `lib/reconcile/snapshots.ts`: historical snapshots are listed as carried-over historical fact and **excluded from pass/fail** rather than recomputed and compared (US1 acceptance scenario 7)

**Checkpoint**: `npm run test:golden`, `npm run coverage:check` and `npm run reconcile` all green, with a clean report. **This is the MVP** — the parity proof is complete and the migration may proceed.

---

## Phase 4: User Story 2 - Correct a mistake without destroying the record (Priority: P2)

**Goal**: Corrections that preserve history, full attribution of every change,
and account balance modes — the integrity properties the spreadsheet cannot
offer.

**Independent Test**: Record an entry, record a correction against it, and
confirm the original is still present, the link between them is explicit, and
derived totals reflect the net.

### Tests for User Story 2 ⚠️

- [ ] T069 [P] [US2] Correction test in `tests/unit/corrections.test.ts`: the original survives, the correction references it explicitly, and derived totals reflect the net (FR-015)
- [ ] T070 [P] [US2] Cycle-prevention test in `tests/unit/reverses-cycle.test.ts`: a linear correction chain is **allowed**; a cycle is rejected. Include a two-row cycle, which the CHECK constraint from T029 cannot catch
- [ ] T071 [P] [US2] Audit trail test in `tests/unit/audit.test.ts` (SC-004): every write records who, when, what changed and what it was before
- [ ] T072 [P] [US2] Atomicity test in `tests/atomicity/rollback.test.ts` (quickstart V9, US2 acceptance scenario 4): force a mid-write failure and assert no partial effect is visible. **Runs on both drivers** via the vitest projects from T006
- [ ] T073 [P] [US2] Mid-import failure test in `tests/atomicity/import-rollback.test.ts` (FR-005a): force a failure part-way through the import and assert the database is left empty, not half-populated
- [ ] T074 [P] [US2] Balance mode tests in `tests/unit/balance-modes.test.ts`: every account imports in `stated` mode at the spreadsheet's exact value (FR-025); switching to `derived` requires an opening balance and date, is recorded, and changes no figure dated before the switch (FR-026)

### Implementation for User Story 2

- [ ] T075 [US2] Implement the correction write path in `lib/data/corrections.ts`: a correction is a new row linked by `reverses_id`; no in-place edit or delete of history (FR-013, FR-015)
- [ ] T076 [US2] Implement `reverses_id` cycle validation in `lib/data/corrections.ts`: walk the chain from the proposed row before insert and reject if it revisits a row already seen. **This runs inside the same transaction as the insert**, so a concurrent writer cannot slip a cycle past it. A SQLite CHECK cannot express this (data-model.md)
- [ ] T077 [P] [US2] Implement audit logging in `lib/data/audit.ts` capturing actor, action, before and after for every write, composed into the same `atomically` batch as the write it records — an audit entry that can be committed separately from its write is not a record of it
- [ ] T078 [P] [US2] Implement balance-mode handling in `lib/data/accounts.ts`: `stated` vs `derived`, with the opening balance and date required for `derived`, and derived balances computed as opening plus net of entries since (FR-024 – FR-027)
- [ ] T079 [US2] Extend the reconciliation report in `lib/reconcile/render.ts` to distinguish a derived balance from a stated one wherever a balance is shown (US2 acceptance scenario 7)

**Checkpoint**: US1 and US2 both pass independently. `npm run test:atomicity` green on both drivers.

---

## Phase 5: User Story 3 - Ask what things were worth at the time (Priority: P3)

**Goal**: Every rate ever recorded is retained with the date it applied, so a
past position can be recomputed at the rate that actually applied then.

**Independent Test**: Record several rates for one asset on different dates, then
compute a figure as of an earlier date and confirm it uses the rate in force on
that date, not the latest.

### Tests for User Story 3 ⚠️

- [ ] T080 [P] [US3] Rate history test in `tests/unit/rate-history.test.ts` (SC-005): record several rates for one asset across dates; all remain retrievable, none is lost by being superseded
- [ ] T081 [P] [US3] As-of lookup test in `tests/unit/rate-as-of.test.ts`: a value computed as of a past date uses the rate in force on that date, not the latest
- [ ] T082 [P] [US3] Append-only test in `tests/unit/rate-append-only.test.ts` (FR-038): recording a rate inserts and never updates; the `UNIQUE(household_id, asset_class, as_of)` constraint holds
- [ ] T083 [P] [US3] Reproducibility test in `tests/unit/rate-reproducible.test.ts` (FR-041): reading the same figure twice without an intervening write returns the same answer — no column holds a live external lookup
- [ ] T084 [P] [US3] Automated-actor test in `tests/unit/rate-fetch-actor.test.ts` (FR-039): a rate written through the automated path records `source = 'fetch'` and is attributable as an automated actor without a `created_by` user

### Implementation for User Story 3

- [ ] T085 [P] [US3] Implement the rate write path in `lib/rates/record.ts`: append-only, through the same path for manual, imported and fetched sources (FR-038, FR-039)
- [ ] T086 [P] [US3] Implement rate-age reporting in `lib/rates/age.ts` (FR-040): the age of the rate in use is determinable wherever a converted figure is shown, and a skipped fetch never silently reuses the previous rate as though it were current
- [ ] T087 [US3] Extend `lib/reconcile/render.ts` to surface the rate age alongside every rate-converted figure (depends on T086)

> **Not in this feature**: the *scheduled* fetch that calls `lib/rates/record.ts`.
> It needs a deployed Worker and a Cron trigger, and this feature ships no
> deployment. The write path, the `fetch` source and its attribution are
> delivered and tested here; only the trigger is deferred. See *Deferred* in
> [spec.md](spec.md).

**Checkpoint**: US1–US3 pass independently.

---

## Phase 6: User Story 4 - Keep one household's finances away from another's (Priority: P3)

**Goal**: Household isolation that is structural — the unsafe query is not
expressible, and a cross-household reference is not storable.

**Independent Test**: Create two households with records in each, then attempt to
read the second household's records while operating as the first, including by
supplying the other household's identifier directly as input.

### Tests for User Story 4 ⚠️

- [ ] T088 [P] [US4] Scoped-read isolation test in `tests/isolation/scoped-reads.test.ts` (SC-003, quickstart V5): two households with records in each; every cross-household read returns nothing, including when the other household's id is passed directly as a parameter
- [ ] T089 [P] [US4] Cross-household foreign key test in `tests/isolation/cross-household-fk.test.ts`: attempting to store a transaction in household A referencing an account in household B is **rejected by the database**, not merely absent from reads. This is the gap composite FKs exist to close and scoped reads cannot cover
- [ ] T090 [P] [US4] Surface test in `tests/isolation/surface.test.ts`: assert the raw Drizzle client is not reachable from the `lib/data/` public exports, so an unscoped query cannot be written against the exported surface (FR-022)

### Implementation for User Story 4

- [ ] T091 [US4] Implement the scoped repository surface in `lib/data/repository.ts`: constructed from a household context, every query scoped in the data-access layer rather than by handler discipline. Scoping derives from the authenticated identity and is never taken from caller-supplied input (FR-021)
- [ ] T092 [US4] Implement per-table scoped repositories in `lib/data/repositories/` (one file per concern, mirroring `db/schema/`), exposing only household-scoped operations
- [ ] T093 [US4] Enforce the module boundary in `lib/data/index.ts`: export the scoped repositories only. `db/client.ts` must not be re-exported (Principle IX, depends on T021)

**Checkpoint**: All four user stories pass independently. `npm run test:isolation` green.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T094 [P] Implement `loadHouseholdState()` in `lib/data/state.ts` composing the full payload from one batch of queries, so feature 004's UI can keep its one-round-trip contract (plan.md, Principle VI)
- [ ] T095 [P] Add the `MissingRateError`, `IncompleteDumpError`, `TimezonePreflightError` and `CorrectionCycleError` types to `lib/errors.ts` with messages that state what was wrong and what to do
- [ ] T096 [P] Update `README.md` with the Node 22 requirement, the import and reconcile commands, and a pointer to `specs/003-data-foundation/quickstart.md`
- [ ] T097 [P] Document the live Apps Script defect in `README.md`: updating the USD rate from the app permanently destroys the `GOOGLEFINANCE` formula in `Rates!B2`. Update the dollar rate in the sheet, not the app, until cutover
- [ ] T098 Run the full quickstart V1–V9 sequence from `specs/003-data-foundation/quickstart.md` and confirm every scenario passes and the V3 report reads cleanly start to finish (SC-007)
- [ ] T099 Re-run `npm run coverage:check` after all derivations exist and reconcile `specs/003-data-foundation/contracts/coverage.md` against `lib/derive/` — a derivation added during implementation without a matrix row is a coverage gap
- [ ] T100 Record the measured computation count in `plan.md`, replacing "roughly 25" with the number the coverage matrix actually produced

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational. Blocks nothing, but everything else is worthless until it passes
- **US2 (Phase 4)**: Depends on Foundational. Independent of US1 in code; sequenced after it by priority
- **US3 (Phase 5)**: Depends on Foundational
- **US4 (Phase 6)**: Depends on Foundational
- **Polish (Phase 7)**: Depends on all desired stories

### Critical path inside Phase 2

```
T008 (dump reader) → T011 → T012 → T013 (matrix, DECISION POINT) → T014
T015 ‖ T016 → T017 (convert)
T022…T027 (schema, parallel) → T028 (composite FKs) → T029 (CHECKs) → T030 (migration)
T020 (atomically) — blocks every write path in every story
T032 (goldens) depends on T008 + T016
```

**T013 gates Phase 3.** The derivation task list (T048–T055) is sized from the
11 functions currently in `derivations.md`. If the matrix assigns formula ranges
to no owner, add derivations to the contract and add tasks here before starting.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **US2 (P2)**: Can start after Phase 2 — independently testable. T079 touches `lib/reconcile/render.ts`, which US1 creates; if run in parallel with US1, sequence T079 after T062
- **US3 (P3)**: Can start after Phase 2 — independently testable. T087 touches `lib/reconcile/render.ts`; same note as T079
- **US4 (P3)**: Can start after Phase 2 — independently testable

### Within Each User Story

- Tests are written and **confirmed failing** before implementation
- Money primitives before derivations
- Derivations green before the reconciliation report is meaningful — the report compares their output to the dump
- `atomically` before any write path (its array-not-callback shape determines how every write is written)
- Mappers before the importer; importer before the reconciler

---

## Parallel Opportunities

### Phase 1
T003, T004, T005, T006 run together (four separate config files).

### Phase 2
- T009, T010 together (preflight and validation, separate files)
- T015, T016, T018 together (money types, rounding, lint script)
- T022–T027 together — six schema files, one per concern, no interdependencies until T028

```bash
# Phase 2 schema fan-out
Task: "Define households/users/memberships/invitations in db/schema/tenancy.ts"
Task: "Define accounts/property_holdings/liabilities in db/schema/holdings.ts"
Task: "Define transactions/installments/cards/card_payments/income_settings in db/schema/ledger.ts"
Task: "Define rates in db/schema/rates.ts"
Task: "Define snapshots in db/schema/history.ts"
Task: "Define audit_log in db/schema/audit.ts"
```

### Phase 3 (US1) — the widest fan-out in the feature

```bash
# All 13 golden/unit tests together — separate files, no interdependencies
Task: "Golden test for convert in tests/golden/convert.test.ts"
Task: "Golden test for holdingsByClass in tests/golden/holdings.test.ts"
Task: "Golden test for totals in tests/golden/totals.test.ts"
Task: "Golden test for netWorth in tests/golden/networth.test.ts"
Task: "Golden test for installmentSummary in tests/golden/installments.test.ts"
Task: "Golden test for unpaidByYear in tests/golden/unpaid-by-year.test.ts"
Task: "Golden test for assetMix in tests/golden/asset-mix.test.ts"
Task: "Golden test for transactionEgp in tests/golden/transaction-egp.test.ts"
Task: "Golden test for monthlyRollup in tests/golden/monthly-rollup.test.ts"
Task: "EDATE clamping test in tests/unit/edate.test.ts"
Task: "Arabic round-trip test in tests/golden/arabic.test.ts"
Task: "Missing-rate test in tests/unit/missing-rate.test.ts"
Task: "Timezone preflight test in tests/unit/preflight.test.ts"

# Then the derivations — five files, seven tasks
Task: "Implement totals in lib/derive/totals.ts"
Task: "Implement netWorth in lib/derive/networth.ts"
Task: "Implement installmentSummary in lib/derive/installments.ts"
Task: "Implement assetMix in lib/derive/dashboard.ts"
Task: "Implement transactionEgp in lib/derive/transactions.ts"

# Then the four report sections — separate files
Task: "Verdict rules in lib/reconcile/verdict.ts"
Task: "Report rendering in lib/reconcile/render.ts"
Task: "Behavioural divergences in lib/reconcile/divergences.ts"
Task: "Unreachable values in lib/reconcile/unreachable.ts"
```

### Phases 4–6
All six US2 tests (T069–T074), all five US3 tests (T080–T084) and all three US4
tests (T088–T090) are separate files and run together. With three people, US2,
US3 and US4 proceed fully in parallel after Phase 2.

---

## Implementation Strategy

### MVP: Phases 1–3

1. Phase 1 Setup
2. Phase 2 Foundational — **stop at T013** and check the coverage matrix before continuing
3. Phase 3 US1
4. **STOP and VALIDATE**: `npm run test:golden && npm run coverage:check && npm run reconcile`

At that point the parity proof exists, which is the only thing that unblocks
feature 004 (Principle X, FR-009). US2–US4 add integrity, rate history and
isolation, and none of them is worth anything if the numbers do not reconcile.

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + US1 → **MVP: parity proven, cutover unblocked**
3. + US2 → corrections and audit
4. + US3 → rate history
5. + US4 → isolation

US4 is P3 by priority but is **cheapest now and most expensive later** — the
composite foreign keys land in Phase 2 regardless, because retrofitting them
means migrating every table.

### Parallel Team Strategy

Phase 1 + Phase 2 together, then split: US1 needs the most hands and is the only
thing on the critical path; US2, US3 and US4 proceed independently alongside it.
Sequence T079 and T087 after T062, since both extend `lib/reconcile/render.ts`.

---

## Notes

- `[P]` = different files, no dependencies
- Every expected value is **generated from the dump's `value` field** (T032), never hand-copied from a contract table. This is the single most important rule in the list
- A golden ending in `00` on an installment figure is the signature of the `display` bug — check it
- Confirm tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
