# RPC Contract Delta: Credit Card Payments & Monthly Cash-Flow Planning

**Date**: 2026-08-26 | **Plan**: [../plan.md](../plan.md)

Delta over `specs/001-income-sheet-companion/contracts/rpc-contract.md`.
Everything there remains in force unchanged. Transport is unchanged:
`google.script.run` promises via the client `rpc()` helper (timeout + one
retry for reads, no retry for writes); errors carry a trailing `[CODE]`
token. Existing error codes are reused: `VALIDATION`, `RANGE_DENIED`,
`LOG_FULL`, `LOCK_TIMEOUT`, `MARKER_MISSING`. No new codes.

**There is no plan RPC.** The monthly plan, forecast and Home summary are
client-side derivations (FR-046, research R6); the server's entire role is
storing/reading payments and salary settings.

---

## `getState()` — extended

Two new top-level slices. Shapes of all existing slices are unchanged
(FR-041).

```jsonc
{
  // …existing slices unchanged…
  "creditCards": {
    "setup": true,            // false ⇒ tab missing; other fields empty
    "cards": ["ADIB CC", "HSBC CC", "CASHBACK CC", "Valu CC"],
    "payments": [
      {
        "row": 2,             // sheet row; identity within this payload only
        "card": "ADIB CC",
        "dueDate": "2026-08-25",
        "amountEgp": 1000,
        "statementMonth": "08/2026",   // never blank: reader defaults to due-date month
        "paid": false,
        "note": ""
      }
    ]
  },
  "income": {
    "salary": { "amount": 2250, "currency": "USD", "day": 27 }  // null when setup=false
  }
}
```

Reader rules: payments are rows 2–500 with non-blank column A; `paid` is
`E === "Yes"` (case-insensitive, like installments); a blank statement month
is emitted as the due date's `mm/yyyy` (FR-006). Cards are non-blank
`H7:H26` values in sheet order.

---

## New write RPCs (all in `planning.gs`, all through `guardedWrite`)

### `addCcPayment(payment)`

Records one payment (FR-003). Append under `LockService` at the first
blank-A row in 2–500.

Request:

```jsonc
{
  "card": "ADIB CC",           // must match a card-list name, else VALIDATION
  "amount": 1000,              // finite > 0, else VALIDATION (FR-005)
  "dueDate": "2026-08-25",     // yyyy-mm-dd, else VALIDATION
  "statementMonth": "08/2026", // optional; defaulted to due-date month (FR-006)
  "note": ""                   // optional, ≤ 500 chars
}
```

Writes `A{r}:F{r}` = `[card, dueDate, amount, statementMonth, "No", note]`.

Response: `{ "creditCards": {…} }` (full recomputed slice, for
`reconcileSlice`). Errors: `VALIDATION`, `LOG_FULL` (no blank row ≤ 500),
`LOCK_TIMEOUT`, `MARKER_MISSING` (tab absent).

Duplicate handling: none server-side — the client warns before sending when
an identical card+amount+dueDate exists, and when any installment shares the
dueDate+amount (BR-012); the owner may proceed.

### `setCcPaymentStatus(row, paid)`

Two-way status toggle (FR-007, BR-002) — deliberately unlike
`setInstallmentPaid`: no `ALREADY_PAID` error, either direction, any number
of times.

- `row`: integer 2–500; target row must currently hold a payment
  (non-blank A), else `VALIDATION`.
- `paid`: boolean → writes `E{row}` = `"Yes"`/`"No"`.

Response: `{ "creditCards": {…} }`. Touches nothing else — no transaction
row, no account cell (FR-008, BR-011, SC-010).

### `updateCcPayment(row, payment)`

Explicit correction path (FR-012). `payment` has the `addCcPayment` shape
plus `"paid": true|false` (an edit must not silently reset status). Same
field validation as `addCcPayment`; `row` must hold a payment. Rewrites
`A{row}:F{row}` in one write.

Response: `{ "creditCards": {…} }`.

### `deleteCcPayment(row)`

Explicit removal (FR-012). `row` must hold a payment. Writes
`A{row}:F{row}` = six empty strings. The blanked slot is reused by the next
append; clients must treat `row` as invalid after deletion.

Response: `{ "creditCards": {…} }`.

### `setSalary(salary)`

Edits the recurring salary (FR-014).

Request: `{ "amount": 2250, "currency": "USD", "day": 27 }` — amount finite
`> 0`; currency in `{USD, EGP}`; day integer 1–31 (BR-006 clamping happens
at derivation, not storage). Three single-cell writes: `I2`, `I3`, `I4`.

Response: `{ "income": {…} }`.

---

## Client obligations (unchanged mechanics, listed for completeness)

- All five writes are optimistic: apply to the store, render, roll back with
  an error toast on failure (constitution VI).
- Plan/forecast/Home-summary recompute on every render from the current
  store — after any reconcile of `creditCards`, `income`, `rates`, `data`,
  `total` or `installments` slices the verdicts are automatically current
  (FR-033).
- `setup === false` ⇒ the Plan/Cards/Forecast screens and the Home card
  render a "run setupCreditCardPlanning() once" instruction instead of data.
