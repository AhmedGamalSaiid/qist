# Data Model: Credit Card Payments & Monthly Cash-Flow Planning

**Date**: 2026-08-26 | **Plan**: [plan.md](plan.md) | **Sheet contract**: [contracts/sheet-layout.md](contracts/sheet-layout.md)

Two kinds of entities:

- **Stored** — live in the `CC Payments` tab of the owner's sheet, the single
  source of truth (constitution I). The app holds them only inside the cached
  `getState()` payload.
- **Derived** — computed client-side at render time from stored entities and
  existing state slices. Never persisted anywhere (FR-046).

---

## Stored entities

### Credit Card

A named card the owner holds. Identity is the name string (FR-001).

| Field | Type | Storage | Validation |
|-------|------|---------|------------|
| `name` | string | `CC Payments!H7:H26`, one per row | non-empty; unique within the list |

- Seeded on setup: `ADIB CC`, `HSBC CC`, `CASHBACK CC`, `Valu CC` (A-008).
- Adding a card = typing a name into the next blank H-cell in the sheet — a
  data operation, no code change (FR-001). It then appears in every card
  dropdown, list and subtotal automatically.
- Carries no balance, limit or rate (A-007). Valu CC is an ordinary member of
  this list (FR-002, A-008a).
- No app-side write path exists for cards in this version.

### Credit Card Payment

One dated obligation against one card (FR-003). One sheet row.

| Field | Type | Storage | Validation (server, FR-005) |
|-------|------|---------|-----------------------------|
| `row` | int | sheet row number (2–500) | identity within the payload; not stable across deletes+appends |
| `card` | string | col A | must equal a name in the card list |
| `dueDate` | ISO date string | col B (date, `mm/dd/yyyy`) | required; parseable |
| `amountEgp` | number | col C (`#,##0`) | finite, `> 0`; EGP only (A-002) |
| `statementMonth` | `"mm/yyyy"` string | col D (text) | optional; defaults to due-date month (FR-006); descriptive only (BR-001) |
| `paid` | boolean | col E (`Yes`/`No`) | `No` on creation |
| `note` | string | col F | optional; ≤ 500 chars |

**Status is a projection, not a field** (BR-002, FR-009):

```
status(payment, today) =
    Paid     if payment.paid
    Overdue  if !payment.paid && payment.dueDate < today
    Pending  otherwise
```

**State transitions** — freely reversible two-way toggle, no side effects
(D-003, FR-007/FR-008, BR-011):

```
Pending/Overdue --markPaid--> Paid
Paid --markUnpaid--> Pending (or Overdue if dueDate < today, derived)
any --update--> same status, corrected fields   (FR-012, explicit action)
any --delete--> row blanked                     (FR-012, explicit action)
```

No transition touches the transaction log or any account balance (SC-010).

**Relationships**: belongs to exactly one Credit Card (by name). Never merged
with Installments (BR-010); an obligation lives on exactly one side (BR-012 —
enforced by a client-side warning when a CC payment matches an installment's
due date + amount, never by blocking).

### Income Source (salary settings)

Exactly one at launch (A-003); structured so more can follow (FR-013/FR-023).

| Field | Type | Storage | Validation |
|-------|------|---------|------------|
| `amount` | number | `CC Payments!I2` | finite, `> 0` |
| `currency` | `"USD"` \| `"EGP"` | `CC Payments!I3` | in list |
| `day` | int | `CC Payments!I4` | 1–31; clamped per month by BR-006 at derivation time |

Seeded on setup: `2250 / USD / 27` (FR-013). Editable via `setSalary`
(FR-014) or directly in the sheet (FR-043/FR-045).

### Installment *(existing — read only)*

Already tracked on the Installments tab; read via the existing
`readInstallments_()` and **never redefined or re-entered** (FR-021, FR-041).
Fields used by derivation: `name`, `dueDate`, `amountEgp`, `paid`.

---

## Derived entities (client memory only)

### Obligation Timeline Entry

One line of a month's dated timeline (FR-019). Built fresh on every render.

| Field | Type | Source |
|-------|------|--------|
| `date` | ISO date | payment/installment due date |
| `sourceType` | `"creditCard"` \| `"installment"` | record origin (FR-042; extensible per FR-023) |
| `sourceName` | string | card name or installment name |
| `amountEgp` | number | stored amount |
| `status` | `Pending` \| `Paid` \| `Overdue` | projection above |

Ordering: date ascending; same-date entries listed individually under one
date heading (US2 #3).

### Monthly Plan

One month's computed summary (FR-018, FR-024–FR-033). Inputs: the two stored
entities above + existing slices (`installments.rows`, `rates.usd.value`,
`total.totalOfAll`, `meta.fetchedAt`).

| Field | Type | Rule (spec "Cash-Flow Calculation Rules") |
|-------|------|------|
| `month` | `"yyyy-mm"` | grouping key = due-date month (FR-020, BR-001) |
| `openingBalance` | number | current month: `total.totalOfAll` verbatim (D-001, FR-030); later months: previous `closingBalance`, negatives carried (FR-029) |
| `openingAsOf` | ISO datetime | `meta.fetchedAt`, displayed beside the labelled opening balance (FR-032, edge "balance moves") |
| `incomeEvents[]` | `{date, amountEgp, original: {amount, currency}}` | salary projected into the month, day clamped (BR-006); converted at `rates.usd.value` (BR-005, FR-016) |
| `incomeUnavailable` | boolean | true when currency ≠ EGP and rate missing/zero — income shown as unavailable, never as 0 (FR-017) |
| `totalIncome` | number | Σ income events |
| `ccTotal`, `installmentTotal` | number | per-category subtotals (FR-018); sum to `totalObligations` |
| `totalObligations` | number | all obligations dated in month, any status (BR-003) |
| `stillToPay` | number | Pending + Overdue only (FR-022, BR-003) |
| `timeline[]` | Timeline Entry | ordered; rule 2 (obligations before income on same date, BR-007) |
| `firstShortfallDate` | ISO date \| null | rule 4 (FR-025) |
| `amountToPrepare` | number | rule 5 — largest deficit before next income event (FR-026); 0 when no pre-income obligations (US4 #5) |
| `closingBalance` | number | rule 6 |
| `monthlyRemaining` | number | rule 7 = closing balance; surplus when positive |
| `monthlyShortage` | number | rule 8 = `max(0, −monthlyRemaining)`; independent fact from `amountToPrepare` (FR-027) |
| `isProjection` | boolean | true for future months (BR-009) |

Current-month walk only processes events dated today or later (rule 10);
Paid obligations never enter the walk (rule/FR-028).

### Forecast

Array of 12 Monthly Plans (BR-008), chained by `closingBalance →
openingBalance`. Rendered as the multi-month table (FR-036); shortage months
flagged (FR-038). Obligations beyond the horizon are excluded from rows but
included in any "total outstanding" figure shown (edge "horizon boundary").

### Home Summary *(derived)*

`{monthTotalDue, nearestUnpaid: {sourceType, sourceName, amountEgp, date},
shortageIndicator: {amountToPrepare} | null}` — current-month projection of
the above for the Home card (FR-037, US6). `nearestUnpaid` falls forward to
later months when the current month is fully paid (US6 #3).
