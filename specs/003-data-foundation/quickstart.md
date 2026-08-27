# Quickstart: Data Foundation Migration

How to run and validate this feature. No UI — verification is the reconciliation
report and the test suite (SC-007).

## Prerequisites

```bash
nvm use 22
```

Node 22+ is required; Wrangler 4.x refuses to run on Node 20. The repository's
nvm default is still 20, so this is per-shell.

Also required: `migration/sheet-dump.json` present and committed. It is the
authoritative model — nothing below works without it.

## Setup

```bash
npm install
npm run db:generate && npm run db:migrate:local
```

`db:generate` runs Drizzle Kit against `db/schema/`; `db:migrate:local` applies
migrations to the local SQLite database. Generated migrations are never
hand-edited — regenerate instead.

## Validation scenarios

### V1 — Derivations match the spreadsheet

```bash
npm run test:golden
```

Every one of the 25 recovered computations asserts against a value from the
dump, with today pinned to `2026-08-27` and USD/EGP to `50.2554`. Expected
values are in [contracts/derivations.md](contracts/derivations.md).

**Pass**: all green. **Fail**: the port is not faithful — fix the code, never
the expected value (FR-010).

### V2 — Import is faithful and idempotent

```bash
npm run import -- --dump migration/sheet-dump.json
npm run import -- --dump migration/sheet-dump.json   # again
```

**Expect**: 17 accounts, 56 installments, 1 transaction, 1 snapshot, 3 rates,
0 card payments. The second run changes nothing — same row counts, same ids
(FR-003).

**Watch for**: 2 snapshots instead of 1 means `History` row 2 was imported. It
is a live formula mirror, not a snapshot, and importing it persists a derived
value (FR-012).

### V3 — The reconciliation report is clean

```bash
npm run reconcile
```

**Pass**: no `FAIL` lines, and every `DIVERGED` line matches the register in
[contracts/reconciliation.md](contracts/reconciliation.md). Any divergence not
registered in advance is a `FAIL`.

**Read it fully.** A `PASS (tolerance)` line showing a difference far below its
allowance is healthy; several lines all drifting the same direction is a
systematic error hiding inside individually-acceptable numbers — which is why
FR-031 requires the observed difference to be printed rather than just the
verdict.

### V4 — Arabic survives the round trip

```bash
npm run test:golden -- --grep "arabic"
```

Account and liability names must come back byte-exact through extraction,
import and reporting (FR-004).

### V5 — Households cannot see each other

```bash
npm run test:isolation
```

Creates two households with records in each, then attempts cross-household
reads — including passing the other household's id directly as a parameter.
Every attempt must return nothing (FR-021, SC-003).

**This is a security test.** A failure here is a defect, not a bug.

### V6 — Missing rates fail loudly

```bash
npm run test:unit -- --grep "MissingRate"
```

Converting on a date earlier than any recorded rate must throw, never
substitute zero or reach forward to a later rate (FR-019, FR-043). A silent
zero here would under-report net worth without any visible symptom.

### V7 — Money never becomes a float

```bash
npm run lint:money
```

Static check: no `number` division, `parseFloat`, or float literal in
`lib/money/`, `lib/rates/` or `lib/derive/`. Principle II admits no exceptions.

## Completion gate

This feature is done when V1–V7 pass **and** the V3 report is clean. Until
then the migration may not proceed to feature 004 (Principle X, FR-009).

## What this feature does not deliver

No UI, no auth flow, no deployment. The Apps Script application keeps running
untouched — but see the live defect in
[recovered-model.md](../../migration/recovered-model.md): updating the USD rate
from that app permanently destroys the `GOOGLEFINANCE` formula in `Rates!B2`.
Update the dollar rate in the sheet, not the app, until cutover.
