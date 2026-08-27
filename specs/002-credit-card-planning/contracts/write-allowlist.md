# Write-Allowlist Delta: Credit Card Payments & Monthly Cash-Flow Planning

**Date**: 2026-08-26 | **Plan**: [../plan.md](../plan.md)

Delta over `specs/001-income-sheet-companion/contracts/write-allowlist.md`.
This is the **write-path review** required by the constitution: exactly the
ranges below become writable, all on the new `CC Payments` tab, and nothing
else changes. All existing entries and invariants are untouched.

The five new entries are added to the **existing single `WRITE_ALLOWLIST`
object in `api.gs`** (constitution II: one config object). `guardedWrite()`
remains the only mutation path for every RPC; `parseA1_` continues to admit
only single-row targets.

## New entries

| Caller (RPC) | Sheet | Allowed target | Row bound | Why writable |
|---|---|---|---|---|
| `addCcPayment` | `CC Payments` | `A{r}:F{r}` | 2 ≤ r ≤ 500 | append one payment; exact first-blank-A row resolved under lock by the RPC (same pattern and rationale as `addTransaction` — the allowlist cannot re-resolve a row the write is about to fill) |
| `setCcPaymentStatus` | `CC Payments` | `E{r}` | 2 ≤ r ≤ 500 | two-way Paid toggle; column E only |
| `updateCcPayment` | `CC Payments` | `A{r}:F{r}` | 2 ≤ r ≤ 500 | correction path (FR-012); RPC additionally verifies the row currently holds a payment |
| `deleteCcPayment` | `CC Payments` | `A{r}:F{r}` | 2 ≤ r ≤ 500 | removal by blanking A–F; no structural row delete, so held row numbers and the append-scan invariant survive |
| `setSalary` | `CC Payments` | `I2`, `I3`, `I4` (single cells) | rows 2–4, column I only | the three salary settings values |

## What remains unreachable (invariants preserved)

- **Header row `A1:F1`**, settings labels `H2:H4`, cards header `H6` — no
  entry's column/row bounds include them (rows start at 2; column H is in no
  entry).
- **Card list `H7:H26`** — deliberately not writable by the app; adding a
  card is a hand edit in the sheet (FR-001, research R4).
- **Every other tab** — each entry names `CC Payments` as its only sheet;
  `guardedWrite` rejects any other sheet name for these callers. In
  particular the Transactions tab and all account cells stay unreachable
  from the status toggle (FR-008, SC-010).
- **Formulas** — the tab contains none (sheet contract), and even a future
  hand-added formula outside `A2:F500`/`I2:I4` would sit outside every
  bound.
- **Multi-row writes** — still impossible (`parseA1_` rejects them), so no
  bulk operation can sweep the table.

## Not a write path (for the reviewer's completeness)

`setupCreditCardPlanning()` in `planning.gs` writes headers, labels, seeds,
formats and validations when the tab is first created. It is editor-run,
one-time, idempotent maintenance in the same trust class as the existing
beautifier `Code.gs` (which already writes formulas outside the allowlist).
It is never called from any client code path, and the "Only myself" web-app
deployment means no one but the owner could invoke it anyway. Runtime RPCs
fail with `MARKER_MISSING` rather than create the tab.

## Negative tests (added to TEST-CHECKLIST.md via quickstart)

For each new caller: a target on another sheet, a target outside its
columns (e.g. `setCcPaymentStatus` → `D5`), row 1, row 501, a multi-row
range, and a shape/payload mismatch — all must throw `RANGE_DENIED` (or
`VALIDATION` before reaching the guard) and leave the sheet byte-identical.
