# Quickstart & Validation: Credit Card Payments & Monthly Cash-Flow Planning

**Date**: 2026-08-26 | **Plan**: [plan.md](plan.md)

Runnable end-to-end validation for the feature. References:
[data-model.md](data-model.md),
[contracts/rpc-contract.md](contracts/rpc-contract.md),
[contracts/write-allowlist.md](contracts/write-allowlist.md),
[contracts/sheet-layout.md](contracts/sheet-layout.md).

## Prerequisites

- Implementation complete (`planning.gs`, `plan-js.html`, and the modified
  `api.gs` / `index.html` / `styles.html` / `i18n-js.html` / `app-js.html`).
- `clasp` logged in with `.clasp.json` pointing at the bound script project
  (see `clasp-setup.md`).
- **Before touching anything**: open the app and the sheet and record every
  installment summary figure, dashboard KPI and the Total tab row — this is
  the SC-005 non-regression baseline.

## Setup (once)

```bash
clasp push
```

Then, in the Apps Script editor: run `setupCreditCardPlanning()` (approve
the permission prompt if asked), and redeploy the Web App version as
described in `DEPLOY.md` — pushing alone does not update `/exec` (see the
"clasp redeploy trap" note in `README.md`).

**Expected**: a new `CC Payments` tab matching
[contracts/sheet-layout.md](contracts/sheet-layout.md) — 4 seeded cards,
salary `2250 / USD / 27`, yellow input areas, Yes/No and card dropdowns.
Re-running the function changes nothing further (idempotent). Every
pre-existing tab is untouched.

## Scenario walkthroughs

Reload the app at the `/exec` URL after setup. Each scenario maps to the
spec's user stories; do the whole list once in English/LTR, then repeat the
render-only checks in Arabic/RTL (FR-039).

### 1. Record payments (US1)

1. From Home: tap **Plan → + Card payment** — count the taps to a submitted
   payment: `ADIB CC, 1000, due 08/25/2026`. **Expected**: ≤ 3 taps
   (FR-040/SC-001); payment appears instantly (optimistic), status Pending.
2. Add `HSBC CC, 3000, due 09/10/2026`. Open **More → Cards**.
   **Expected**: each card lists only its own payments, grouped by month,
   with per-card still-to-pay totals; CASHBACK CC and Valu CC show an
   explicit "nothing due" state.
3. Try amount `0`, amount `-5`, and a blank due date. **Expected**: rejected
   with a clear message; nothing saved (FR-005).
4. Toggle the ADIB payment Paid, refresh the app, toggle it back.
   **Expected**: single tap each way; survives refresh; no prompt for a
   source account; transaction log and every account balance unchanged
   (D-003, SC-010). Back-toggle restores Pending — or Overdue if the date
   has passed (BR-002).
5. Add the same ADIB payment again. **Expected**: duplicate warning dialog;
   proceeding saves it anyway; cancel saves nothing.
6. Open the sheet: both payments visible and hand-editable; edit an amount
   in the sheet, pull-to-refresh in the app. **Expected**: app shows the
   edited amount (FR-045/SC-008).

### 2. Monthly timeline (US2)

With an installment due in the same month as a card payment, open **Plan**
for that month. **Expected**: one chronologically ordered timeline, entries
labelled with card/installment name; card and installment subtotals that sum
to the month total (SC-003); same-date entries listed separately under one
date heading; an empty month shows an explicit empty state. **Then verify
the SC-005 baseline: every installment and dashboard figure is unchanged.**

### 3. Income, remaining, shortage (US3)

**Expected on any month**: salary shown as both `$2,250` and its EGP value
at the current USD rate. Change the USD rate in the app; return to the plan.
**Expected**: converted income and every derived total move (FR-033). Set
the rate cell in the sheet to `0`, refresh. **Expected**: income shows as
unavailable with a prompt to set the rate — not treated as 0 (FR-017).
Restore the rate. Check one month with obligations < income (surplus shown,
no shortage) and one with obligations > income + opening balance (shortage
= exact difference).

### 4. Amount to prepare (US4 — the worked example)

Recreate the spec's worked example: opening balance ≈ 400 EGP (or note the
current Total-tab figure `B0`), ADIB 1,000 due 25th, installment 1,000 +
salary on 27th. **Expected**: plan reports first shortfall on the 25th,
**amount to prepare = 1,600 − B0 adjusted per the walk** (with B0 = 400:
1,600 EGP), while the month still shows a positive end-of-month balance —
both verdicts visible at once (FR-027/SC-004). Also verify: the opening
balance is displayed labelled "Total of All in EGP" with its as-of time
(FR-032); marking the ADIB payment Paid removes it from the walk (FR-028);
a month whose obligations all fall after the salary date reports nothing to
prepare (US4 #5).

### 5. Forecast (US5)

Open the forecast from the Plan screen. **Expected**: 12 rows (current + 11,
BR-008), each with income / cards / installments / total / remaining-or-
shortage; shortage months visually marked; tapping a row opens that month's
timeline; future months labelled as projections; a negative closing balance
carries into the next row (FR-029).

### 6. Home summary (US6)

**Expected**: Home shows total due this month and the nearest unpaid
obligation (source, amount, date) within 10 seconds of opening the app
(SC-002); the shortage indicator appears only when one exists and opens the
Plan screen; with everything paid this month it points to the next month's
first unpaid obligation or states there is none.

## Safety verification (constitution II — before release)

In the Apps Script editor, add a temporary `test_ccAllowlistRejections()`
that calls `guardedWrite` for each new caller with the negative targets
listed in [contracts/write-allowlist.md](contracts/write-allowlist.md)
(wrong sheet, wrong column, row 1, row 501, multi-row, shape mismatch).
**Expected**: every call throws `RANGE_DENIED`; the sheet is unchanged.
Delete the function afterward. Also verify `addCcPayment` on a full table
(temporarily fill A500) returns `LOG_FULL`.

## Perceived-speed checks (constitution VI)

Cold load performs exactly one `getState()` (network tab); revisit renders
from sessionStorage before any RPC; month navigation and forecast cause
zero RPCs; a status toggle in airplane mode flips instantly, then rolls
back with an error toast.

## Done when

Every expected outcome above holds in both languages, and the SC-005
baseline comparison shows zero changed pre-existing figures.
