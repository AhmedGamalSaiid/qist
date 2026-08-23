# RPC Contract: Income Sheet Companion

Transport: `google.script.run` (client) ↔ global functions in `api.gs`
(server). Client wraps calls in `rpc(name, ...args)` — Promise, 30 s timeout,
1 automatic retry for reads only, never for writes (see research R6).

All parameters and return values are JSON-safe: strings, numbers, booleans,
plain objects/arrays. Dates are ISO `"YYYY-MM-DD"` strings. Errors are thrown
server-side with message codes below; the client maps codes → localized toast
text.

Payload/entity shapes: see [data-model.md](../data-model.md). Writable
ranges: see [write-allowlist.md](write-allowlist.md) — every write below is
validated against it by `guardedWrite()` before touching the sheet.

## Read

### `getState() → AppState`

The only read RPC. Reads all nine tabs in one execution and returns the full
`AppState`. No arguments. Must not write anything. Called on cold load and
manual refresh only.

### `doGet(e) → HtmlOutput`

Serves the app shell (evaluated `index.html` + partials, viewport meta,
IFRAME sandbox). Not part of the JSON RPC surface.

## Writes

Every write: (1) validates inputs, (2) resolves its target range dynamically,
(3) passes through `guardedWrite()` (throws `RANGE_DENIED` on any target
outside the caller's allowlist entry), (4) re-reads the affected slices, (5)
returns them for client reconciliation.

### `addTransaction(tx) → { recent, monthly, dashboard }`

- `tx = { date, type, category, account, amount, currency, note? }` per
  data-model validation. Server re-validates every field (enums exact,
  amount > 0, account must exist in Data!A, note ≤ 500 chars).
- Under `LockService` script lock: scan `Transactions!A2:A500` for first
  blank A; write `A:F` (real Date in A, real number in E) and `H` (note) of
  that row only. Column G untouched.
- Errors: `VALIDATION` (bad field, message says which), `LOG_FULL` (no blank
  row ≤ 500), `RANGE_DENIED`, `LOCK_TIMEOUT`.

### `setInstallmentPaid(row) → { installments, dashboard }`

- `row`: sheet row number of an installment within the schedule's dynamic
  extent, whose current Paid value is "No".
- Sets `Installments!E{row}` to `"Yes"`. Only false → true; already-paid →
  `ALREADY_PAID` error (client treats as benign no-op after refreshing the
  slice).
- Errors: `VALIDATION` (row outside schedule), `ALREADY_PAID`, `RANGE_DENIED`.

### `setRate(key, value) → { rates, dashboard, total, investment, netWorth }`

- `key ∈ {"usd","gold","silver"}` → row 2/3/4; `value` finite > 0.
- Atomically writes `Rates!B{r}` = value and `Rates!C{r}` = today (real
  Date), both allowlisted, in the same execution.
- Errors: `VALIDATION`, `RANGE_DENIED`.

### `setAccountAmount(row, value) → { data, total, investment, dashboard, netWorth }`

- `row` must be within the dynamic account extent (row 2 … last row with
  non-empty `Data!A`); `value` finite number.
- Writes `Data!D{row}` only.
- Errors: `VALIDATION`, `RANGE_DENIED`.

### `addAccount(acc) → { data, total, investment, dashboard, netWorth }`

- `acc = { name, category, investment, amount, date? }`; name non-empty and
  not duplicating an existing account name; category one of the five enums;
  date defaults to today.
- Under script lock: target row = last non-empty `Data!A` row + 1; writes
  `A:E` of that row (checkbox-compatible boolean in C).
- Errors: `VALIDATION`, `DUPLICATE_NAME`, `RANGE_DENIED`, `LOCK_TIMEOUT`.

### `setLiabilityAmount(row, value) → { total, dashboard, netWorth }`

- `row` within `Total!I4:I10`'s named entries; `value` finite ≥ 0.
- Writes `Total!J{row}` only.
- Errors: `VALIDATION`, `RANGE_DENIED`.

### `setPropertyPaid(row, value) → { netWorth, dashboard }`

- `row ∈ {9, 10, 11}` (the three property paid-to-date lines); `value`
  finite ≥ 0.
- Writes `Net Worth!B{row}` only.
- Errors: `VALIDATION`, `RANGE_DENIED`.

### `takeSnapshot() → { history }`

- No arguments. Under script lock: invoke the existing snapshot behavior
  (copy History live row's current values as static values to the first
  empty row after the "SNAPSHOTS ↓" marker). Never edits existing snapshot
  rows or row 2.
- Errors: `RANGE_DENIED`, `LOCK_TIMEOUT`, `MARKER_MISSING` (structure
  drift — History tab shape unexpected).

## Error contract

| Code | Meaning | Client behavior |
|---|---|---|
| `VALIDATION` | Input rejected server-side (message names the field) | Rollback + field-level toast |
| `RANGE_DENIED` | Write target outside WRITE_ALLOWLIST | Rollback + generic error toast; indicates a bug — never expected in normal use |
| `LOG_FULL` | No blank transaction row ≤ 500 | Rollback + toast telling owner to extend the sheet |
| `LOCK_TIMEOUT` | Could not acquire script lock (30 s) | Rollback + "try again" toast |
| `ALREADY_PAID` | Installment already Yes | Merge returned slice silently |
| `DUPLICATE_NAME` | Account name exists | Rollback + toast |
| `MARKER_MISSING` / structure errors | Sheet shape drifted from contract | Rollback + explicit "sheet structure changed" message (fail loud, per spec edge case) |
| (transport failure / timeout) | Network drop, Apps Script error | Rollback + error toast; after a **write** timeout also set `store.stale` and prompt manual refresh (write may have landed) |
