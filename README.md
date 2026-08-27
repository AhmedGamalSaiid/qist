# Income Sheet Companion

A phone-first web app for one person — the owner of one particular
personal-finance Google Sheet — that makes the daily jobs (log an expense,
mark an installment paid, update the dollar rate) take seconds instead of
pinch-zooming around a spreadsheet on a phone.

It is served entirely by a Google Apps Script Web App bound to that sheet.
There is no server, no database, no account, and no third-party service. The
sheet is the app's only data store; the app is a nicer set of hands for it.

## What it does

**Reads everything.** All screens — Home, Add, Installments, Cards, Plan,
Forecast, Accounts, Rates, Total & Investment, Net Worth, History,
Transactions, Settings — show the same numbers the sheet does, computed by
the sheet's own formulas (or, for the plan/forecast screens, derived
client-side at render time from the cached payload).

**Writes only what you can already edit by hand.** Thirteen actions:

- log a transaction
- mark an installment paid
- update the USD / gold / silver rate (the "as of" date sets itself)
- edit an account amount, or add a new account
- edit a short-term liability amount
- edit one of the three property paid-to-date values
- take a net-worth snapshot
- record, edit, delete or toggle a credit-card payment
- edit the recurring salary settings

Every one of these targets a cell that is yellow in the sheet — the sheet's
own "you may type here" convention, which the app reuses: **if it's yellow in
the app, it writes to the sheet; if it isn't, it's read-only.** Formulas,
computed columns, headers and existing snapshot rows are unreachable by any
code path, enforced server-side by a single allowlist
([`contracts/write-allowlist.md`](specs/001-income-sheet-companion/contracts/write-allowlist.md)).

**Speaks English and Egyptian Arabic**, with real RTL — the layout mirrors,
not just the strings. The Arabic is written in an Egyptian register rather
than MSA (`فاضل 6 يوم`, `مفيش حاجة هنا`, `جرّب تاني`), so it reads the way the
owner actually talks about money. Numbers stay Latin digits (`1,234`) and
dates stay `mm/dd/yyyy` in both languages so the app and the sheet stay
readable side by side. Switch languages in **Settings → اللغة / Language**;
the choice persists across sessions.

## What it does not do

**It works online only. There is no offline mode.** Apps Script cannot serve
a service worker, so the app does not pretend to be an installable offline
PWA. "Add to Home Screen" gives you an icon and a full-screen window — it
still needs a connection, and a write attempted without one visibly rolls
back rather than queueing silently. For a finance app, a dropped write you
believed had landed is worse than an honest error message.

Also out of scope on purpose: no multi-user or sharing, no editing or
deleting transactions (corrections are counter-entries — the Add screen says
so), and no changes to the sheet's structure, formats or existing scripts.
The sheet's original beautifier script is included in this repo untouched, so
that a `clasp push` never deletes it.

## Credit cards & monthly cash-flow planning

A second feature (`specs/002-credit-card-planning/`) adds a **CC Payments**
tab holding credit-card payment obligations, a card list and the recurring
salary settings. It's created once by running `setupCreditCardPlanning()`
from the Apps Script editor — the same one-time, editor-run pattern as the
original beautifier; runtime code never creates or restructures sheets, and
`getState()` reports `creditCards.setup = false` until you've run it.

The **Plan** screen (5th bottom-nav item) derives, entirely client-side from
the cached payload, a month's dated timeline, income vs. obligations, and —
the feature's actual point — the day-by-day "amount to prepare before the
next salary lands" that a simple monthly surplus/shortage figure hides. The
**opening balance it starts from is the Total tab's "Total of All in EGP"
figure — an all-assets number, not free cash** — this is called out plainly
in the UI label rather than hidden, since a number that looks like "how much
I have to spend" is not quite that.

## The sheet

Bound to Google Sheet `1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc` and its
tabs: Dashboard, Data, Total, Installments, Investment, Rates, Net Worth,
Transactions, History, and (once set up) CC Payments.

The sheet remains fully usable on its own. Everything it did before the app
existed, it still does; delete the app and nothing is lost.

## Feature 003 — Data foundation migration

The spreadsheet's financial model has been recovered out of its 707 formulas and
restated as tested TypeScript over a Cloudflare D1 (SQLite) schema. This ships
**no UI, no auth and no deployment** — the Apps Script app above keeps running
untouched. What it delivers is a database, a library of pure derivations, an
importer, and a reconciliation report that says whether the restatement is
faithful.

### Requirements

**Node 22 or newer.** Wrangler 4.x refuses to run on Node 20, and the
repository's nvm default is still 20, so this is per-shell:

```bash
nvm use 22
```

### Commands

```bash
npm install
npm run db:generate && npm run db:migrate:local
npm run import -- --dump migration/sheet-dump.json
npm run reconcile
```

`import` is idempotent: identifiers are derived from each row's natural key, so
running it twice produces the same rows with the same ids and changes nothing.
`reconcile` prints every ported figure beside the spreadsheet's own value in
minor units, and **exits non-zero on any FAIL**, so the completion gate is
machine-enforced rather than something a person has to remember to check.

The full validation sequence — V1 to V9, covering the goldens, the import, the
report, Arabic round-tripping, tenant isolation, missing rates, the float lint,
formula coverage and dual-driver atomicity — is in
[specs/003-data-foundation/quickstart.md](specs/003-data-foundation/quickstart.md).

### A live defect in the Apps Script app — update the dollar rate in the sheet

`Rates!B2` holds `=GOOGLEFINANCE("CURRENCY:USDEGP")`, a live market feed. It is
also coloured as an input cell, so the app offers it as editable — and
**updating the USD rate from the app permanently destroys that formula**,
replacing it with a static number. There is no undo path in the app.

Until cutover, **update the dollar rate in the sheet, not in the app.** Gold and
silver are ordinary typed values and are unaffected.

This is one of the reasons feature 003 replaces the live lookup with dated rate
records: a spreadsheet cell that re-evaluates on every recalculation makes every
figure downstream of it — `Total`, `Investment`, `Net Worth`, `Dashboard`,
`History` row 2 and `Transactions!G` — move between one open and the next, so
no figure the sheet has ever produced can be reproduced afterwards.

### Design documents

- [Spec 003](specs/003-data-foundation/spec.md) — what is being recovered and why
- [Plan 003](specs/003-data-foundation/plan.md)
- [Research 003](specs/003-data-foundation/research.md) — the decisions, with what was rejected
- [Data model 003](specs/003-data-foundation/data-model.md) — the authoritative schema
- [Derivations contract](specs/003-data-foundation/contracts/derivations.md) — each recovered formula as a function
- [Reconciliation contract](specs/003-data-foundation/contracts/reconciliation.md) — report format and verdict rules
- [Coverage matrix](specs/003-data-foundation/contracts/coverage.md) — GENERATED: every formula range → its owning derivation
- [Quickstart 003](specs/003-data-foundation/quickstart.md) — validation scenarios V1–V9
- [Discrepancy register](specs/003-data-foundation/discrepancies.md)

## Repository layout

```
appsscript/            pushed to the bound Apps Script project (clasp rootDir)
  Code.gs              the sheet's existing beautifier — pulled, never edited
  api.gs               doGet, the write allowlist, getState, the 8+5 write RPCs
  planning.gs          setupCreditCardPlanning(), CC Payments readers/RPCs
  index.html           app shell and all screens
  styles.html          design tokens and components
  i18n-js.html         EN/AR dictionary and formatters
  app-js.html          store, RPC layer, optimistic writes, rendering, charts
  plan-js.html         pure client-side cash-flow derivation (no DOM/store access)
specs/001-income-sheet-companion/   spec, plan, data model, contracts
specs/002-credit-card-planning/     spec, plan, data model, contracts

db/                    feature 003 — Drizzle schema, generated migrations, drivers
  schema/              one file per concern; data-model.md is authoritative
  migrations/          Drizzle Kit output — never hand-edited
lib/                   feature 003 — the recovered model as TypeScript
  money/               minor units, per-class scale, half-up rounding, conversion
  rates/               dated rate lookup, the append-only write path, rate age
  derive/              one pure function per recovered computation
  data/                scoped repositories — the only database surface
  import/              dump reader, preflight, mappers, atomic importer
  reconcile/           verdicts, figures, coverage, the report
scripts/               import, reconcile, goldens, coverage, lint:money
tests/                 golden, unit, isolation, atomicity
migration/             the extracted sheet dump and the recovered model
```

## Getting started

1. [`clasp-setup.md`](clasp-setup.md) — get the script ID, log in, and
   **pull before you ever push** (this is the step that protects the existing
   `Code.gs`).
2. [`DEPLOY.md`](DEPLOY.md) — push, deploy as a Web App ("Execute as: me",
   "Only myself"), and add it to your phone's home screen.
3. [`TEST-CHECKLIST.md`](TEST-CHECKLIST.md) — the acceptance gate. Run the
   allowlist negative tests in section 2 first.

## Design documents

- [Specification](specs/001-income-sheet-companion/spec.md) — what and why
- [Plan](specs/001-income-sheet-companion/plan.md) — stack and structure
- [Research](specs/001-income-sheet-companion/research.md) — the decisions and
  the sharp edges behind them
- [Data model](specs/001-income-sheet-companion/data-model.md) — sheet ranges
  → payload shape
- [RPC contract](specs/001-income-sheet-companion/contracts/rpc-contract.md)
- [Write allowlist](specs/001-income-sheet-companion/contracts/write-allowlist.md)
  — the definitive list of every cell the app may ever write
- [Quickstart](specs/001-income-sheet-companion/quickstart.md) — validation
  scenarios V1–V13
- [Constitution](.specify/memory/constitution.md) — the ten principles the
  whole thing is gated against (v2.0.0; specs 001 and 002 below were written
  against v1.0.0 and cite its numbering)

- [Spec 002 — Credit Cards & Cash-Flow Planning](specs/002-credit-card-planning/spec.md)
- [Plan 002](specs/002-credit-card-planning/plan.md)
- [Data model 002](specs/002-credit-card-planning/data-model.md)
- [RPC contract delta 002](specs/002-credit-card-planning/contracts/rpc-contract.md)
- [Write-allowlist delta 002](specs/002-credit-card-planning/contracts/write-allowlist.md)
- [Sheet contract 002 — `CC Payments`](specs/002-credit-card-planning/contracts/sheet-layout.md)
- [Quickstart 002](specs/002-credit-card-planning/quickstart.md)
