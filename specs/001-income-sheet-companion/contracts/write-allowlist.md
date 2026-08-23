# Write Allowlist Contract

The definitive table of every cell the app may ever write. Implemented as a
single frozen `WRITE_ALLOWLIST` object in `api.gs`, keyed by RPC name;
`guardedWrite()` is the only function that calls `setValue(s)` and throws
`RANGE_DENIED` for any target not covered by the calling RPC's entry.
Everything not listed here — all formulas, computed cells, headers, summary
blocks, `Transactions!G`, `History` rows 1–3 and existing snapshots — is
unwritable by construction.

| RPC | Sheet | Allowed target (resolved dynamically per call) | Notes |
|---|---|---|---|
| setAccountAmount | Data | `D{row}`, row ∈ [2, lastAccountRow] | lastAccountRow = last non-empty `Data!A` |
| addAccount | Data | `A{r}:E{r}`, r = lastAccountRow + 1 | whole new row, under lock |
| setLiabilityAmount | Total | `J{row}`, row ∈ [4, 10] | I-column names never written |
| setInstallmentPaid | Installments | `E{row}`, row ∈ [2, lastScheduleRow] | value literally `"Yes"` only |
| setRate | Rates | `B{r}` and `C{r}`, r ∈ {2, 3, 4} | C written only as auto-today paired with B |
| setPropertyPaid | Net Worth | `B{row}`, row ∈ {9, 10, 11} | |
| addTransaction | Transactions | `A{r}:F{r}` and `H{r}`, r = first blank `A` in [2, 500] | under lock; G never included |
| takeSnapshot | History | `A{r}:G{r}`, r = first blank row after "SNAPSHOTS ↓" marker | static values only, under lock |

Invariants (enforced by `guardedWrite` + covered by TEST-CHECKLIST negative
tests):

1. No RPC can write to a sheet/range pair belonging to another RPC's entry.
2. Dynamic bounds are resolved server-side at call time from live sheet
   content, never from client-supplied extents.
3. `guardedWrite` refuses multi-cell targets that exceed the resolved shape
   (e.g. a 2-row payload against a 1-row entry).
4. Adding any new writable range is a deliberate edit to `WRITE_ALLOWLIST`
   reviewed against Constitution Principle II — never a side effect.
