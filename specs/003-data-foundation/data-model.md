# Data Model: Data Foundation Migration

Entities, fields and constraints. Derived from
[recovered-model.md](../../migration/recovered-model.md) and the decisions in
[research.md](research.md). Nothing here is stored that can be computed —
see the **Derived, never stored** section at the end.

**Conventions**

- Every id is a ULID string (sortable, no coordination required).
- Every domain table has `household_id TEXT NOT NULL` with an index, and is
  reachable only through a scoped repository (R5).
- All money is an integer minor unit with the scale fixed per asset class (R1).
  A column named `*_minor` is never a float and never a string.
- Dates are `TEXT` in `YYYY-MM-DD`. Timestamps are `INTEGER` epoch milliseconds.
- `created_at` on every table; `updated_at` only where in-place update is legal.

## Tenancy

### `households`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT NOT NULL | |
| `base_currency` | TEXT NOT NULL | `'EGP'`. The reporting currency. |
| `timezone` | TEXT NOT NULL | `'Africa/Cairo'`. The single canonical zone (R8, FR-034). |
| `created_at` | INTEGER NOT NULL | |

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `email` | TEXT NOT NULL UNIQUE | |
| `name` | TEXT | |
| `image` | TEXT | |
| `created_at` | INTEGER NOT NULL | |

Auth flows are out of scope (feature 004). This table exists so `audit_log` and
`memberships` have something real to reference.

### `memberships`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `user_id` | TEXT NOT NULL FK | |
| `role` | TEXT NOT NULL | `owner` \| `admin` \| `member` \| `viewer` |
| `joined_at` | INTEGER NOT NULL | |

UNIQUE(`household_id`, `user_id`). At least one `owner` per household.

### `invitations`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `email` | TEXT NOT NULL | |
| `role` | TEXT NOT NULL | as above, never `owner` |
| `token_hash` | TEXT NOT NULL | the token itself is never stored |
| `expires_at` | INTEGER NOT NULL | |
| `invited_by` | TEXT NOT NULL FK users | |
| `accepted_at` | INTEGER | null while outstanding |

## Holdings

### `accounts` — from `Data!A:E` (17 rows)
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `name` | TEXT NOT NULL | may be Arabic; preserved byte-exact (FR-004) |
| `asset_class` | TEXT NOT NULL | `EGP` \| `USD` \| `GOLD` \| `SILVER` — CHECK constrained |
| `is_investment` | INTEGER NOT NULL | 0/1. Partitions `Total` from `Investment`. |
| `balance_mode` | TEXT NOT NULL | `stated` \| `derived` (FR-024). Every row imports as `stated` (FR-025). |
| `quantity_minor` | INTEGER | the stated quantity; NULL when `balance_mode = 'derived'` |
| `opening_quantity_minor` | INTEGER | required when `derived`, else NULL (FR-026) |
| `opening_date` | TEXT | required when `derived`, else NULL |
| `as_of` | TEXT | the informational date from `Data!E` |
| `sort_order` | INTEGER NOT NULL | preserves sheet row order for stable reporting |
| `archived_at` | INTEGER | soft delete; history is never removed |
| `created_at` | INTEGER NOT NULL | |

CHECK: `balance_mode = 'stated'` ⟹ `quantity_minor IS NOT NULL` and both
opening columns NULL. `balance_mode = 'derived'` ⟹ both opening columns NOT
NULL and `quantity_minor IS NULL`. This makes an inconsistent account
unrepresentable rather than merely invalid.

### `property_holdings` — from `Net Worth!B9:B11`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `name` | TEXT NOT NULL | |
| `paid_to_date_minor` | INTEGER NOT NULL | EGP piastres |
| `sort_order` | INTEGER NOT NULL | |

These are **assets** — `Net Worth!B12` sums `B4:B11`, which includes them.
Three rows, hand-entered, the only yellow cells on that tab.

### `liabilities` — from `Total!I4:J10`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `name` | TEXT NOT NULL | may be Arabic |
| `amount_minor` | INTEGER NOT NULL | EGP piastres |
| `sort_order` | INTEGER NOT NULL | |

Short-term liabilities. `Total!K2 = SUM(J4:J10)` becomes a derivation over
this table. Property installments are **not** here — they live in
`installments`, and the distinction is what separates `Net Worth!B15` from
`B16`.

## Ledger

### `transactions` — from `Transactions!A:H` (1 row today)
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `occurred_on` | TEXT NOT NULL | `YYYY-MM-DD` |
| `kind` | TEXT NOT NULL | `income` \| `expense` \| `transfer` |
| `category` | TEXT | |
| `account_id` | TEXT FK accounts | |
| `amount_minor` | INTEGER NOT NULL | in `currency`'s minor unit |
| `currency` | TEXT NOT NULL | `EGP` \| `USD` |
| `rate_id` | TEXT FK rates | the rate in force on `occurred_on`; NULL when `currency = 'EGP'` |
| `note` | TEXT | |
| `reverses_id` | TEXT FK transactions | set on a correcting entry (FR-015) |
| `created_by` | TEXT NOT NULL FK users | |
| `created_at` | INTEGER NOT NULL | |

**No `amount_egp_minor` column.** The EGP value is derived at read time from
`amount_minor × rates[rate_id]`, which keeps it out of storage (FR-012) while
still frozen at the transaction's own date (FR-042). Pinning the rate rather
than the result is R4.

CHECK: `currency = 'USD'` ⟹ `rate_id IS NOT NULL`. `reverses_id` must not
point at a row that itself reverses the pointer — no cycles.

### `installments` — from `Installments!A:E` (56 rows)
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `plan_name` | TEXT NOT NULL | NOOR / Castello Share / Castello MINE |
| `due_on` | TEXT NOT NULL | |
| `amount_minor` | INTEGER NOT NULL | EGP piastres |
| `kind` | TEXT | the sheet's type column |
| `paid_at` | INTEGER | NULL = unpaid. Replaces the `"Yes"`/`"No"` string. |
| `paid_by` | TEXT FK users | |
| `sort_order` | INTEGER NOT NULL | |
| `created_at` | INTEGER NOT NULL | |

`paid_at` as a nullable timestamp rather than a boolean records *when* a
payment happened, which the sheet cannot express.

### `cards`, `card_payments` — from `CC Payments` (0 rows today)
Modelled per the feature-002 contract. The tab was set up and never used, so
there is nothing to import; the tables exist so feature 004 has somewhere to
write. `cards`: `id`, `household_id`, `name`, `limit_minor`, `statement_day`,
`due_day`. `card_payments`: `id`, `household_id`, `card_id`, `due_on`,
`amount_minor`, `paid_at`.

### `income_settings`
| Column | Type | Notes |
|---|---|---|
| `household_id` | TEXT PK FK | one row per household |
| `salary_minor` | INTEGER | EGP piastres |
| `pay_day` | INTEGER | day of month |
| `updated_at` | INTEGER NOT NULL | |

## Rates

### `rates` — from `Rates!A:C`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `asset_class` | TEXT NOT NULL | `USD` \| `GOLD` \| `SILVER` |
| `rate_minor` | INTEGER NOT NULL | EGP per unit, scaled per R1 |
| `scale` | INTEGER NOT NULL | 4 for USD, 2 for metals — stored so a rate is never misread |
| `as_of` | TEXT NOT NULL | effective from this date forward (R3) |
| `source` | TEXT NOT NULL | `manual` \| `fetch` \| `imported` |
| `created_by` | TEXT FK users | NULL when `source = 'fetch'` |
| `created_at` | INTEGER NOT NULL | |

UNIQUE(`household_id`, `asset_class`, `as_of`). Append-only: recording a rate
inserts, never updates (FR-038). No column may hold a live external lookup
(FR-041) — this is the direct fix for `Rates!B2`.

Import seeds three rows at `as_of = 2026-08-17` (the sheet's stated date), with
USD at `502554` scale 4 — the value captured in the dump.

## History

### `snapshots` — from `History` rows 4+
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `taken_on` | TEXT NOT NULL | |
| `liquid_minor`, `investments_minor`, `property_paid_minor`, `short_term_liabilities_minor`, `remaining_installments_minor`, `net_worth_minor` | INTEGER NOT NULL | as recorded |
| `source` | TEXT NOT NULL | `imported` \| `app` |
| `created_at` | INTEGER NOT NULL | |

Exempt from the derive-don't-store rule — a snapshot is a dated historical
fact, not a cache (Principle I, FR-012).

**`History` row 2 is excluded from import.** It is a live formula mirror of
`Net Worth`, not a snapshot; row 3 is a literal `SNAPSHOTS ↓` separator.
Exactly **one** genuine snapshot exists, dated 2026-08-17.

## Audit

### `audit_log`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `actor_id` | TEXT FK users | NULL when `actor_kind = 'system'` |
| `actor_kind` | TEXT NOT NULL | `user` \| `system` — the scheduled rate fetch is `system` (FR-039) |
| `action` | TEXT NOT NULL | `create` \| `update` \| `archive` \| `import` |
| `entity` | TEXT NOT NULL | table name |
| `entity_id` | TEXT NOT NULL | |
| `before_json` | TEXT | NULL on create |
| `after_json` | TEXT | NULL on archive |
| `at` | INTEGER NOT NULL | |

Append-only. No update or delete path exists (FR-013).

## Derived, never stored

Each becomes a pure function taking explicit inputs — including `today` (R8) —
and is contracted in [contracts/derivations.md](contracts/derivations.md).

| Derivation | Replaces |
|---|---|
| `holdingsByClass(accounts, rates, { isInvestment })` | `Total!D2:J2`, `Investment!D2:J2` |
| `totalOfAll(...)` | `Total!L2` |
| `investmentTotal(...)` | `Investment!K2` |
| `shortTermLiabilities(...)` | `Total!K2` |
| `netWorth(...)` → `{ excludingInstallments, includingInstallments }` | `Net Worth!B12:B20`, both figures (D4) |
| `installmentSummary(installments, today)` | `Installments!H2:H10` |
| `unpaidByYear(installments)` | `Dashboard!I2:I22` |
| `assetMix(...)` | `Dashboard!F2:F6` |
| `transactionEgp(transaction, rate)` | `Transactions!G` — frozen at date (D6) |
| `monthlyRollup(transactions, months)` | `Transactions!J:N` |

`Dashboard!B3:B12` is pure re-exposure of the above and needs no derivation of
its own.
