# Phase 0 Research: Credit Card Payments & Monthly Cash-Flow Planning

**Date**: 2026-08-26 | **Plan**: [plan.md](plan.md)

The Technical Context contains no NEEDS CLARIFICATION — the spec's Resolved
Decisions (D-001…D-003) settled the open product questions, and the codebase
(read in full: `api.gs`, `Code.gs`, `app-js.html`, `i18n-js.html`,
`index.html`, `styles.html`) settles the integration questions. This document
records the design decisions the plan rests on, with rationale and the
alternatives considered.

---

## R1. Where credit-card and income data lives in the sheet

**Decision**: One new tab, **`CC Payments`**, holding three regions:

- **Payments table** `A1:F500` — header row 1, input rows 2–500:
  `Card | Due Date | Amount (EGP) | Statement Month | Paid | Note`.
- **Settings block** `H2:I4` — labels in H, values in I:
  `Salary Amount` (I2), `Salary Currency` (I3), `Salary Day` (I4);
  seeded `2250 / USD / 27` (FR-013).
- **Card list** `H7:H26` — header `Cards` in H6; seeded with
  `ADIB CC, HSBC CC, CASHBACK CC, Valu CC` (FR-001, A-008). Column A's
  data validation sources this range, so a card typed into H is instantly
  usable everywhere (adding a card = data operation, not a code change).

The tab contains **no formulas anywhere** — every cell is either a header,
a label, or an input.

**Rationale**: One tab keeps the sheet tidy and gives the feature a single
sheet-side contract. A formula-free body makes FR-044 ("writes can never
reach a formula") true by construction, not just by allowlist. Column order
`Due Date | Amount | Paid` deliberately mirrors the Installments tab
(B/C/E), so the owner reads it with zero relearning (constitution VII), and
per-card/per-month grouping stays an app-side derivation rather than a
sheet-side formula that could drift (FR-046).

**Alternatives considered**:
- *Two tabs (payments + settings)*: more structure for no benefit; the
  settings block is three cells.
- *Reusing the Transactions tab with a new type*: violates BR-010/FR-042
  (obligations and transactions must stay separable) and would entangle the
  append paths.
- *Sheet-side summary formulas (per-card totals)*: rejected — computed cells
  in the new tab would need protecting from the app's own writes and would
  duplicate the client's derivation (FR-046 forbids a second source of
  truth).

## R2. How the new tab gets created

**Decision**: A one-time, **editor-run** function
`setupCreditCardPlanning()` in `planning.gs`: creates the tab if absent,
writes headers/labels/seeds, applies number formats (`mm/dd/yyyy`, `#,##0`),
Yes/No and card-list data validations, yellow input styling, and the
Installments status conditional-format rules (green paid / red overdue /
amber due-soon). It is idempotent — re-running it never touches rows that
hold data. Runtime RPCs never create or restructure sheets; if the tab is
missing, `getState()` returns `creditCards.setup = false` and the app shows
a setup instruction instead of the feature screens.

**Rationale**: Constitution II's model is "runtime writes go through one
guarded funnel; structural/maintenance work is owner-run from the editor" —
exactly how the existing beautifier `Code.gs` works (it even writes
formulas). Lazy auto-creation inside `getState()` would put structural
writes on a read path and outside `guardedWrite()`, weakening the auditable
write story. The deployment loop is already owner-operated (clasp push, run
function, deploy), so one more documented editor step costs nothing.

**Alternatives considered**:
- *Auto-create on first RPC*: rejected — a read RPC that mutates sheet
  structure violates the spirit of constitution II and surprises the owner.
- *Manual tab creation by hand*: error-prone (validations, formats, seeds);
  a function is repeatable and testable.

## R3. Sheet representation of status and statement month

**Decision**:
- **Status** is stored as `Yes`/`No` in column E ("Paid"), exactly like
  Installments column E. `Pending` = `No`; `Overdue` is **never stored** —
  it is derived at view time from `paid === false && dueDate < today`
  (BR-002, FR-009).
- **Statement month** is stored as text `mm/yyyy` in column D; blank means
  "same as due-date month" (FR-006 default applied at entry time by the
  app, but a hand-entered blank is tolerated and derived on read).

**Rationale**: Yes/No keeps the sheet's existing vocabulary and lets the
setup function reuse the Installments conditional-format rules verbatim.
Deriving Overdue keeps the two-way toggle trivial (BR-002) and means no
nightly job or on-open mutation is ever needed. `mm/yyyy` text avoids
date-serial ambiguity for a value that is context, not arithmetic (BR-001).

**Alternatives considered**:
- *Storing `Pending/Paid/Overdue` literally*: rejected — Overdue would go
  stale the moment a date passes and would need rewriting.
- *Statement month as a date (first of month)*: rejected — invites
  `mm/dd/yyyy` display confusion for a non-date concept.

## R4. Write RPC surface and allowlist shape

**Decision**: Five new RPCs, five new `WRITE_ALLOWLIST` entries added to the
existing single object in `api.gs` (full delta in
[contracts/write-allowlist.md](contracts/write-allowlist.md)):

| RPC | Target | Notes |
|-----|--------|-------|
| `addCcPayment` | `A{r}:F{r}`, first blank row 2–500, under lock | mirrors `addTransaction` append pattern |
| `setCcPaymentStatus` | `E{r}`, rows 2–500 | **two-way** toggle (unlike `setInstallmentPaid`, deliberately — BR-002) |
| `updateCcPayment` | `A{r}:F{r}`, rows 2–500 | correction path (FR-012); RPC verifies the row currently holds a payment |
| `deleteCcPayment` | `A{r}:F{r}`, rows 2–500 | writes six blanks; the gap is reused by the next append |
| `setSalary` | `I2`, `I3`, `I4` (three single-cell writes) | `parseA1_` only admits single-row targets |

All validation (positive amount, parseable date, known card — FR-005) is
server-side in the RPC before `guardedWrite`, mirroring `addTransaction`.
Duplicate detection (same card+amount+due date; CC payment matching an
installment's date+amount, BR-012) is a **client-side warning dialog** —
the server never blocks a legitimate duplicate.

**Rationale**: Follows the proven `addTransaction` pattern exactly:
row bounds `[2, 500]` in the allowlist, exact blank row resolved under
`LockService` in the RPC (the allowlist can't re-resolve it because the
append fills column A). Delete-as-blanking keeps the allowlist single-row
model intact — no row shifting, no structural deletes — and the existing
"skip blank column A" read pattern already tolerates gaps.

**Alternatives considered**:
- *`deleteRow()` structural delete*: rejected — bypasses `guardedWrite`,
  shifts every row number the client holds, and breaks the append-scan
  invariant.
- *One `saveCcPayment` upsert RPC*: rejected — add and update have different
  row-resolution rules (locked append vs. caller row + existence check);
  separate allowlist entries keep each auditable.
- *Server-side duplicate rejection*: rejected — spec explicitly says warn,
  don't block (Edge Cases; BR-012 wording).

## R5. `getState()` extension

**Decision**: Two new slices, produced by readers in `planning.gs` and
attached in `getState()`:

```
creditCards: { setup: true|false, cards: [name…],
               payments: [{row, card, dueDate, amountEgp,
                           statementMonth, paid, note}] }
income:      { salary: {amount, currency, day} | null }
```

When the tab is absent: `{setup:false, cards:[], payments:[]}` and
`salary: null` — `getState()` never throws for a not-yet-set-up feature.
Every new write RPC returns `{creditCards}` (and `setSalary` returns
`{income}`) for the existing `reconcileSlice()` mechanism.

**Rationale**: Keeps the single-read-RPC contract (constitution VI); the
slice shapes match the existing camelCase/row-number conventions so the
optimistic-write and reconcile plumbing works unchanged.

## R6. Where the plan is computed

**Decision**: Entirely **client-side**, in a new pure module
`plan-js.html`: builds the event list (unpaid CC payments + unpaid
installments as negatives, salary as positive), sorts by date with
obligations before income on the same date (BR-007), clamps day-of-month
overflow to month end (BR-006), walks the running balance from the opening
balance, and emits per-month: totals, subtotals by category, still-to-pay,
closing balance, shortage, first shortfall date, amount to prepare, and the
ordered timeline (spec "Cash-Flow Calculation Rules" 1–10, implemented
literally). The forecast chains 12 months, carrying closing balances forward
(negative included, BR-008/FR-029). For the current month only events dated
today-or-later are walked (rule 10).

**Inputs** (all already in, or added to, the state payload):
`state.creditCards.payments`, `state.installments.rows`,
`state.income.salary`, `state.rates.usd.value` (conversion, BR-005),
`state.total.totalOfAll` (opening balance, D-001/FR-030),
`state.meta.fetchedAt` (the as-of moment shown beside the opening balance).

**Rationale**: FR-046 mandates view-time derivation with no stored plan;
client-side keeps month navigation and the forecast zero-RPC (constitution
VI) and recomputation on any rate/account change is automatic because those
writes already reconcile the slices the derivation reads (FR-033). Data
volumes (≤ ~600 rows) make this sub-millisecond work.

**Alternatives considered**:
- *Server-side plan in `getState()`*: rejected — a stored/serialized plan
  can drift from its inputs between refreshes (violates FR-046) and would
  recompute on the server for every month navigation or need all 12 months
  shipped anyway.

**Conversion source**: `state.rates.usd.value` (the Rates tab input cell) is
the app's canonical USD rate — it is what `setRate` writes and what every
sheet formula reads. `dashboard.usdRate` and `total.dollarRate` are
downstream copies of it; using the origin cell keeps FR-016/FR-017
(missing/zero rate ⇒ "income unavailable" state, never treated as 0)
testable against a single value.

## R7. Navigation and the 3-tap path (FR-040)

**Decision**: The bottom nav grows from 4 to 5 items:
`Home · Add · Installments · Plan · More`. The **Plan screen** is the
feature hub: month navigation, verdict card, timeline, and a
"+ Card payment" button opening the add-payment form (card chips, amount,
due date, optional statement month/note). The **Cards screen** (per-card
lists grouped by month, per-card still-to-pay totals, edit/delete/toggle)
joins the More menu and is linked from the Plan breakdown. The **Forecast**
(12-month table, rows tap through to the Plan month) is reachable from the
Plan screen header and the More menu. **Home** gains a summary card —
total due this month, nearest unpaid obligation, shortage indicator — that
opens the Plan screen (FR-037).

**Rationale**: Recording a payment is the feature's daily action, so it must
be ≤ 3 taps from Home: Plan (1) → "+ Card payment" (2) → Submit (3).
Five bottom-nav items is the accepted mobile maximum and avoids demoting
Installments, whose figures this feature deliberately leaves untouched.

**Alternatives considered**:
- *Folding card payments into the existing Add screen*: rejected — Add
  records transactions (money that moved); a CC payment is an obligation
  (money that will move). Mixing them invites exactly the
  transaction-vs-status confusion D-003/BR-011 exists to prevent.
- *Cards as the 5th nav item instead of Plan*: rejected — the plan view is
  the destination the owner opens daily (SC-002); cards are an entry/edit
  surface.

## R8. Non-regression strategy (FR-041, SC-005)

**Decision**: No existing function is modified except `getState()` (two
added keys) and no existing screen's data path changes. `readInstallments_`,
the installment summary, dashboard readers and all eight existing write RPCs
are untouched. The test checklist gets an explicit before/after comparison
of every installment and dashboard figure with CC data present.

**Rationale**: The spec makes non-regression a P1 acceptance criterion
(US2 #5); the cheapest way to guarantee it is to add code beside, never
inside, the existing paths.
