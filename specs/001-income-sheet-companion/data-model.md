# Data Model: Income Sheet Companion

The sheet is the schema. This document maps sheet ranges → typed payload
entities → client store. No entity is persisted anywhere but the sheet;
everything below describes the in-flight JSON shape produced by `getState()`
and consumed by the client store. All dates cross the wire as ISO
`"YYYY-MM-DD"` strings; all money as plain numbers (see research R2).

## State Payload (root)

```
AppState {
  dashboard:     Dashboard
  data:          Account[]          // "Data" tab
  total:         Totals
  installments:  { rows: Installment[], summary: InstallmentSummary }
  investment:    InvestmentRow
  rates:         Rates
  netWorth:      NetWorthStatement
  transactions:  { recent: Transaction[], monthly: MonthlySummary[] }
  history:       Snapshot[]
  meta:          { fetchedAt: string /* ISO datetime */, sheetUrl: string }
}
```

`transactions.recent` carries the latest N (N=50, newest first — enough for
the recent-10 list and month filtering of the current period; the full-log
month/type/category filter operates on this window plus `monthly` cards;
older detail rows stay in the sheet, reachable via the sheet link).

## Entities

### Dashboard (read-only) — `Dashboard!A3:C12`, `E1:F6`, `H1:I22`

| Field | Type | Source |
|---|---|---|
| netWorthCurrent | number | KPI table |
| totalAssets, liquid, investments, shortTermLiabilities | number | KPI table |
| remainingInstallments | number | KPI table |
| nextInstallment | { date: ISO, amount: number } | C9 |
| dueNext12Months | number | KPI table |
| overdueCount | number | KPI table |
| usdRate | number | KPI table |
| assetMix | { label: string, egp: number }[] | E1:F6 (5 classes) |
| unpaidByYear | { year: number, amount: number }[] | H1:I22 |

### Account — `Data!A2:E<last>` (editable: amount; addable: whole row)

| Field | Type | Rules |
|---|---|---|
| row | number | sheet row index; identity for writes |
| name | string | required, non-empty; may be Arabic (render in `<bdi>`) |
| category | enum `USD\|EGP\|Gold\|Silver\|Liability` | dropdown values, exact |
| investment | boolean | checkbox cell |
| amount | number | editable; finite number ≥ 0 unless category Liability (sheet's domain — no extra rule imposed) |
| date | ISO string \| null | informational |

Last real account row = last row with non-empty name, discovered per call.
New account appends at that row + 1 with all five columns.

### Totals (read-only + liabilities editable) — `Total!A1:L2`, `I3:J10`

| Field | Type |
|---|---|
| dollarRate, goldRate, silverRate | number |
| perClass | { class: string, native: number, egp: number }[] |
| totalEgp, credit, totalOfAll | number |
| liabilities | Liability[] |

**Liability** — `Total!I4:J10` (J editable): `{ row, name (may be Arabic), amount }`.
Validation: amount finite number ≥ 0.

### Installment — `Installments!A2:E<last>` (editable: paid only)

| Field | Type | Rules |
|---|---|---|
| row | number | identity for `setInstallmentPaid` |
| name | string | NOOR / Castello Share / Castello MINE |
| dueDate | ISO string | |
| amountEgp | number | |
| type | string | |
| paid | boolean | from "Yes"/"No"; write maps true → `"Yes"` (only transition allowed: false → true) |

**Derived (client, at render time, never cached)**:
`status = paid ? "paid" : dueDate < today ? "overdue" : dueDate ≤ today+3mo ? "dueSoon" : "upcoming"`.
Grouping order: overdue, dueSoon, upcoming, paid (collapsed).

**InstallmentSummary** — `Installments!G1:H10` (read-only): totalScheduled,
totalPaid, totalRemaining, nextDueDate (ISO), nextAmountDue, due3m, due6m,
due12m, overdueCount.

### InvestmentRow (read-only) — `Investment!A1:K2`

Same column scheme as Totals row; `usdValue` flagged so the client renders it
`$#,##0.00` (the only $-formatted figure).

### Rates — `Rates!B2:B4` (editable) + `C2:C4` (auto)

```
Rates { usd: RateEntry, gold: RateEntry, silver: RateEntry }
RateEntry { value: number, asOf: ISO string }
```
Validation: value finite, > 0. Writing any rate sets its `asOf` to today
server-side in the same RPC (atomic pair).

### NetWorthStatement — `Net Worth!A1:B20` (editable: B9:B11 only)

```
{ lines: { row, label, value: number, section: "assets"|"liabilities"|"result",
           editable: boolean /* true only for the 3 property rows */ }[] }
```
Validation for property writes: finite number ≥ 0; row must be one of the
three property rows.

### Transaction — `Transactions!A:H` (append-only, A–F + H)

| Field | Type | Rules |
|---|---|---|
| date | ISO string | required; defaults to today client-side; written as a real Date |
| type | enum `Income\|Expense\|Transfer` | required |
| category | enum (13: Salary, Freelance, Food, Transport, Rent, Utilities, Shopping, Health, Education, Entertainment, Installment, Investment, Other) | required |
| account | string | required; must match an existing `Account.name` (validated server-side against Data!A) |
| amount | number | required, finite, > 0 |
| currency | enum `EGP\|USD` | required |
| amountEgp | number | READ-ONLY, sheet-computed column G — never in any write |
| note | string | optional, ≤ 500 chars, Arabic allowed |

Append target: first row in A2:A500 with blank A, found server-side under
lock. If none: error `LOG_FULL` (user told to extend the sheet).

**MonthlySummary** — `Transactions!J:N` (read-only): `{ month, income,
expenses, netSaved, savingsRate }`.

### Snapshot — `History!A4:G<last>` (append via takeSnapshot only)

`{ date: ISO, liquid, investments, propertyPaid, shortTermLiab,
remainingInstallments, netWorth }` — all numbers static (no formulas).
Live row (row 2) is read for "current" but never written.

## Client Store

```
store = {
  state: AppState | null,        // mirrors sessionStorage["isc:state"]
  lang: "en" | "ar",             // mirrors localStorage["isc:lang"]
  pending: OptimisticPatch[],    // in-flight writes, for rollback
  stale: boolean                 // set after write timeout → prompt refresh
}
```

**OptimisticPatch**: `{ id, apply(state), revert(state), rpc, args }` — applied
immediately, reverted on failure, discarded on success after merging the
returned slice.

**Write → returned slice map** (reconciliation, see contracts/rpc-contract.md):

| RPC | Returns (recomputed by sheet, re-read server-side) |
|---|---|
| addTransaction | { recent, monthly, dashboard } |
| setInstallmentPaid | { installments, dashboard } |
| setRate | { rates, dashboard, total, investment, netWorth } |
| setAccountAmount / addAccount | { data, total, investment, dashboard, netWorth } |
| setLiabilityAmount | { total, dashboard, netWorth } |
| setPropertyPaid | { netWorth, dashboard } |
| takeSnapshot | { history } |
