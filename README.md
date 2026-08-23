# Income Sheet Companion

A phone-first web app for one person — the owner of one particular
personal-finance Google Sheet — that makes the daily jobs (log an expense,
mark an installment paid, update the dollar rate) take seconds instead of
pinch-zooming around a spreadsheet on a phone.

It is served entirely by a Google Apps Script Web App bound to that sheet.
There is no server, no database, no account, and no third-party service. The
sheet is the app's only data store; the app is a nicer set of hands for it.

## What it does

**Reads everything.** All ten screens — Home, Add, Installments, Accounts,
Rates, Total & Investment, Net Worth, History, Transactions, Settings — show
the same numbers the sheet does, computed by the sheet's own formulas.

**Writes only what you can already edit by hand.** Exactly eight actions:

- log a transaction
- mark an installment paid
- update the USD / gold / silver rate (the "as of" date sets itself)
- edit an account amount, or add a new account
- edit a short-term liability amount
- edit one of the three property paid-to-date values
- take a net-worth snapshot

Every one of these targets a cell that is yellow in the sheet — the sheet's
own "you may type here" convention, which the app reuses: **if it's yellow in
the app, it writes to the sheet; if it isn't, it's read-only.** Formulas,
computed columns, headers and existing snapshot rows are unreachable by any
code path, enforced server-side by a single allowlist
([`contracts/write-allowlist.md`](specs/001-income-sheet-companion/contracts/write-allowlist.md)).

**Speaks English and Arabic**, with real RTL — the layout mirrors, not just
the strings. Numbers stay Latin digits (`1,234`) and dates stay `mm/dd/yyyy`
in both languages so the app and the sheet stay readable side by side.

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

## The sheet

Bound to Google Sheet `1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc` and its
nine tabs: Dashboard, Data, Total, Installments, Investment, Rates, Net Worth,
Transactions, History.

The sheet remains fully usable on its own. Everything it did before the app
existed, it still does; delete the app and nothing is lost.

## Repository layout

```
appsscript/            pushed to the bound Apps Script project (clasp rootDir)
  Code.gs              the sheet's existing beautifier — pulled, never edited
  api.gs               doGet, the write allowlist, getState, the 8 write RPCs
  index.html           app shell and all ten screens
  styles.html          design tokens and components
  i18n-js.html         EN/AR dictionary and formatters
  app-js.html          store, RPC layer, optimistic writes, rendering, charts
specs/001-income-sheet-companion/   spec, plan, data model, contracts
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
- [Constitution](.specify/memory/constitution.md) — the eight principles the
  whole thing is gated against
