# Implementation Plan: Credit Card Payments & Monthly Cash-Flow Planning

**Branch**: `002-credit-card-planning` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-credit-card-planning/spec.md`

## Summary

Add credit-card payment obligations (four seeded cards, manual per-payment
entry) and a derived Monthly Plan / cash-flow view to the existing Apps Script
web app. All new canonical data lives in one new sheet tab (`CC Payments`)
holding the payments table, the card list and the salary settings — created
once by a manually run setup function, then written only through new
`WRITE_ALLOWLIST` entries and the existing `guardedWrite()` funnel. The plan
itself (monthly totals, dated timeline, running-balance walk, "amount to
prepare") is computed entirely client-side at render time from the existing
`getState()` payload — extended with `creditCards` and `income` slices — using
the Total tab's `totalOfAll` figure as the opening balance (D-001). No
existing read function, installment figure or write RPC changes.

## Technical Context

**Language/Version**: Google Apps Script (V8 runtime) server-side; vanilla
ES2020 JavaScript, HTML, CSS client-side. No build step, no framework, no
transpiler (unchanged from 001).

**Primary Dependencies**: Apps Script services (`SpreadsheetApp`,
`HtmlService`, `LockService`, `Session`); Chart.js 4.x from
`cdnjs.cloudflare.com` (already loaded; no new charts required by this
feature). `@google/clasp` as the local dev/push tool. **No new dependencies.**

**Storage**: The same Google Sheet (ID
`1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc`) — one **new tab
`CC Payments`** holds payments (rows 2–500), the card list and the salary
settings block; no other tab changes. Client: `sessionStorage` cache of the
`getState()` payload (cache only); `localStorage` keeps only the language
preference. Derived plan figures are never stored anywhere (FR-046).

**Testing**: Manual — extend `TEST-CHECKLIST.md` with: the worked cash-flow
example from the spec (August 2026 table), allowlist negative tests for the
five new RPC entries via a temporary editor-run function, the RTL matrix for
the three new screens, and the non-regression check that every installment
and dashboard figure is unchanged (SC-005). No automated framework
(unchanged rationale from 001).

**Target Platform**: Mobile browsers first (Android Chrome, iOS Safari)
inside the Apps Script IFRAME sandbox at the `/exec` URL; desktop is the same
responsive layout enlarged.

**Project Type**: Web app — Apps Script Web App (`doGet` +
`google.script.run` RPCs), deployed "Execute as: me" / "Only myself".

**Performance Goals**: Cold load still exactly one `getState()` RPC (payload
grows ≈ 10–20 KB with ~100 payments — well under the 100 KB budget). Plan
derivation is pure in-memory arithmetic over ≤ ~600 rows — instant (< 16 ms),
recomputed on every render (FR-033/FR-046). Each write remains one RPC
returning recomputed slices.

**Constraints**: Writes only through `guardedWrite()` against the single
`WRITE_ALLOWLIST` object in `api.gs` (new entries added there, nowhere else);
`parseA1_` admits only single-row targets, so multi-cell writes are per-row;
appends resolve the first blank row by scanning column A under `LockService`
(pre-formatted blanks make `getLastRow()` wrong); the `CC Payments` tab is
created by a manually run, editor-only setup function — runtime RPCs never
create or restructure sheets; existing `Code.gs`, `readInstallments_()` and
all existing RPCs untouched (FR-041, SC-005); no offline, no new origins.

**Scale/Scope**: One user. 4 seeded cards (up to 20 card slots), ≤ 499
payment rows, 12-month planning horizon (BR-008), 3 new screens + 1 Home
card + a 5th bottom-nav item, 2 locales (~45 new string keys).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How the plan complies |
|---|-----------|--------|----------------------|
| I | Sheet is the single source of truth | PASS | Payments, cards and salary settings live only in the new `CC Payments` tab — readable and editable by hand without the app (FR-043); sheet-side edits surface on the next refresh (FR-045). The plan is derived at view time and never persisted (FR-046). sessionStorage stays cache-only. The tab is additive: every existing sheet workflow is untouched. |
| II | Formula safety is absolute | PASS | Five new entries (`addCcPayment`, `setCcPaymentStatus`, `updateCcPayment`, `deleteCcPayment`, `setSalary`) are added to the **existing single `WRITE_ALLOWLIST` object** in `api.gs`; all writes go through the existing `guardedWrite()`. The new tab's writable body (`A2:F500`, `I2:I4`) contains no formulas, computed cells or headers by construction; headers (row 1, column H labels) are outside every allowed range. The one-time `setupCreditCardPlanning()` function is editor-run maintenance in the same trust class as the existing beautifier `Code.gs` — it is not reachable from any client code path. Write-path review: exactly the ranges in [contracts/write-allowlist.md](contracts/write-allowlist.md) become writable. |
| III | No external backend | PASS | Same bound Web App, same deployment settings; zero new origins, services or secrets. |
| IV | Phone-first UX | PASS | Bottom nav gains a `Plan` item (5 buttons). Recording a payment: Home → Plan (1) → "+ Card payment" (2) → Submit (3) — ≤ 3 taps (FR-040); status toggle is 1 tap each way (SC-010); all targets ≥ 44 px. All new screens are responsive, not desktop-only. |
| V | Bilingual EN/AR with real RTL | PASS | Every new string goes into `STRINGS = {en, ar}` in `i18n-js.html` (FR-039); card names read from the sheet render with `bdi()` isolation like account names; new screens use the same logical-property layout; numbers stay Latin `#,##0`, dates `mm/dd/yyyy` (A-011). RTL checked per screen in the test checklist. |
| VI | Perceived speed over actual speed | PASS | `getState()` stays the single read RPC — it gains `creditCards` and `income` slices. All plan math is client-side on the cached payload, so month navigation and forecast are zero-RPC. Writes are optimistic with rollback + toast (status toggle flips instantly), and each write RPC returns the recomputed `creditCards`/`income` slice for reconciliation. |
| VII | Visual continuity with the sheet | PASS | The new tab mirrors the Installments grammar (Due Date / Amount / Paid Yes-No columns, green/amber/red status colours via the setup function); the app reuses the same status vocabulary and colours (FR-009), yellow `#FFF2CC` on every editable field, navy/blue chrome. Shortage months use the existing red family, surplus the green family (FR-038). |
| VIII | Honest scope | PASS | No offline, no reminders/notifications, no statement import, no interest math — matching the spec's Out of Scope. Future months are labelled projections (BR-009). The opening-balance caveat (all-assets figure, D-001) is surfaced in the UI label, not hidden. |

**Post-design re-check (after Phase 1)**: PASS — the RPC contract confines
every new write to `CC Payments!A2:F500` and `CC Payments!I2:I4`; the data
model stores nothing outside the sheet; derived entities (Monthly Plan,
Timeline Entry) exist only in client memory. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/002-credit-card-planning/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── rpc-contract.md      # getState slice additions + 5 new write RPCs
│   ├── write-allowlist.md   # Allowlist delta — exactly what becomes writable
│   └── sheet-layout.md      # CC Payments tab layout — the sheet-side contract
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
appsscript/
├── appsscript.json          # unchanged
├── Code.gs                  # EXISTING beautifier — never edited
├── api.gs                   # MODIFIED: +5 WRITE_ALLOWLIST entries; getState()
│                            #   gains creditCards + income slices (delegating
│                            #   to readers in planning.gs); nothing removed
├── planning.gs              # NEW: setupCreditCardPlanning() (editor-run, one-time),
│                            #   lastCcRow_/firstBlankCcRow_ resolvers,
│                            #   readCreditCards_/readIncome_ readers,
│                            #   addCcPayment / setCcPaymentStatus /
│                            #   updateCcPayment / deleteCcPayment / setSalary RPCs
├── index.html               # MODIFIED: 3 new <section> screens (cards, plan,
│                            #   forecast), 5th bottom-nav button, Home plan card slot
├── styles.html              # MODIFIED: plan timeline, forecast table, shortage/
│                            #   surplus tokens (reusing existing status colours)
├── i18n-js.html             # MODIFIED: ~45 new keys in en + ar
├── plan-js.html             # NEW: pure derivation module — event list builder,
│                            #   running-balance walk, month aggregates, forecast
│                            #   carry-forward, day-clamp (BR-006), duplicate checks
└── app-js.html              # MODIFIED: renderers for cards/plan/forecast screens,
                             #   Home summary card, add/edit/toggle/delete flows
                             #   (optimistic), month navigation state

TEST-CHECKLIST.md            # MODIFIED: new-feature test matrix (see quickstart.md)
```

**Structure Decision**: Server logic for the feature is grouped in a new
`planning.gs` so `api.gs` stays the sole home of `WRITE_ALLOWLIST` and
`guardedWrite()` (constitution II keeps the allowlist a single object — the
new entries are added to it in place). Client derivation lives in a new
`plan-js.html` partial included between `i18n-js` and `app-js` so the
cash-flow rules stay a self-contained, order-independent pure module that
`app-js.html` renderers call.

## Complexity Tracking

> No constitution violations — table intentionally empty.
