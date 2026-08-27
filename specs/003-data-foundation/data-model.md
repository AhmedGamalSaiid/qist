# Data Model: Data Foundation Migration

Entities, fields and constraints. Derived from
[recovered-model.md](../../migration/recovered-model.md) and the decisions in
[research.md](research.md). Nothing here is stored that can be computed —
see the **Derived, never stored** section at the end.

**Conventions**

- Every id is a 26-character ULID string (sortable, no coordination required).
  **Ids created by the importer are deterministic**, never randomly generated:
  see *Deterministic import ids* below. FR-003 and SC-006 require a re-run to
  be byte-identical, which a random ULID cannot satisfy.
- Every domain table has `household_id TEXT NOT NULL` with an index, and is
  reachable only through a scoped repository (R5).
- **Every cross-table foreign key is household-composite.** A child row
  references its parent by `(household_id, id)`, against a
  `UNIQUE(household_id, id)` key on the parent — not by `id` alone. A bare
  `id` FK would let a row in household A reference a row in household B,
  which scoped *reads* cannot prevent (Principle IX is structural, so the
  structure must carry it, not the query layer).
- All money is an integer minor unit with the scale fixed per asset class (R1).
  A column named `*_minor` is never a float and never a string.
- Dates are `TEXT` in `YYYY-MM-DD`. Timestamps are `INTEGER` epoch milliseconds.
- `created_at INTEGER NOT NULL` on every table without exception — including
  `property_holdings`, `liabilities` and `income_settings`, which earlier
  drafts of this document omitted. `updated_at` only where in-place update is
  legal.

## Deterministic import ids

The importer derives every id from the row's natural key, so the same dump
always produces the same ids and a re-import is a no-op rather than a
duplicate set (FR-003, SC-006).

```
id = ulid_from(sha256(household_id ‖ table ‖ natural_key)[0:16])
```

The 128 bits are laid into ULID's Crockford base-32 encoding directly, so ids
remain 26 characters and column types are unchanged. They are *not*
time-sortable — `sort_order` and `created_at` carry ordering instead, which is
why every imported table already has one.

Natural keys, one per table:

| Table | Natural key |
|---|---|
| `accounts` | `Data` row number |
| `property_holdings` | `Net Worth` cell reference (`B9`…`B11`) |
| `liabilities` | `Total` row number |
| `transactions` | `Transactions` row number |
| `installments` | `Installments` row number |
| `cards` | `CC Payments` cell reference (`H7`…`H10`) |
| `rates` | `asset_class` + `as_of` |
| `snapshots` | `taken_on` |

The sheet row number is the natural key because the sheet has no stable
identifier of its own and rows are append-only in practice. **This makes row
order load-bearing**: reordering rows in the source sheet and re-importing
would rewrite ids. The dump is a frozen artifact, so this holds for this
migration; it does not survive a second extraction and must not be relied on
past cutover.

Rows created by the application after import use random ULIDs as normal. Only
the importer is deterministic.

The whole import runs in **one transaction** — all tables or none. A partial
import is not idempotent and would leave the reconciliation report reading
against a half-populated database.

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

### `accounts` — from `Data!A:E` (17 rows: 15 asset, 2 liability)
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `name` | TEXT NOT NULL | may be Arabic; preserved byte-exact (FR-004) |
| `kind` | TEXT NOT NULL | `asset` \| `liability` — CHECK constrained. See below. |
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

**The `kind` column, and why `asset_class` alone was not enough.** The `Data`
tab's class column is a data-validation dropdown whose permitted values are
`EGP`, `USD`, `Gold`, `Silver` **and `Liability`**. Two of the 17 rows use it:

| Row | Name | Class | Amount |
|---|---|---|---|
| 13 | `ADIB C.C` | `Liability` | 600 |
| 14 | `HSBC C.C` | `Liability` | 0 |

An earlier draft constrained `asset_class` to the four asset classes, which
would have rejected both rows and made a faithful import of "17 accounts"
impossible. `Liability` is not a fifth asset class — it is a different *kind*
of account that happens to share the dropdown. It is modelled as
`kind = 'liability'`, with `asset_class = 'EGP'` (these are EGP-denominated
card balances).

The sheet's class strings are `Gold` and `Silver` in title case; the importer
uppercases them to `GOLD` and `SILVER`. `Liability` maps to
`kind = 'liability'`, not to `asset_class`.

Accounts of kind `liability` are excluded from every asset total — see
`holdingsByClass` in [contracts/derivations.md](contracts/derivations.md) —
and their balances are subject to D7.

### `property_holdings` — from `Net Worth!B9:B11`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `name` | TEXT NOT NULL | |
| `paid_to_date_minor` | INTEGER NOT NULL | EGP piastres |
| `sort_order` | INTEGER NOT NULL | |
| `created_at` | INTEGER NOT NULL | |

These are **assets** — `Net Worth!B12` sums `B4:B11`, which includes them.
Three rows, hand-entered, the only yellow cells on that tab.

### `liabilities` — from `Total!I4:J10`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `name` | TEXT NOT NULL | may be Arabic — `فرش` at `amount_minor = 6000000` (60,000.00 EGP, `Total!J9`) is a real row (FR-004) |
| `amount_minor` | INTEGER NOT NULL | EGP piastres |
| `sort_order` | INTEGER NOT NULL | |
| `created_at` | INTEGER NOT NULL | |

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

CHECK: `currency = 'USD'` ⟹ `rate_id IS NOT NULL`. This one is expressible as
a table CHECK — it constrains a single row.

**Cycle prevention is not a CHECK.** A SQLite `CHECK` constraint may only
reference columns of the row being written; it cannot follow `reverses_id` to
another row, so "no cycles" is not expressible there. An earlier draft of this
document asserted it as a CHECK, which would have silently enforced nothing.

Three rules, enforced where each is actually enforceable:

| Rule | Enforced by |
|---|---|
| A row may not reverse itself (`reverses_id = id`) | table CHECK — single-row |
| A row may not be reversed twice | `UNIQUE(household_id, reverses_id)` (partial, `WHERE reverses_id IS NOT NULL`) |
| No cycles of length > 1 | repository validation, inside the write transaction |

Correction chains are **allowed** — a correction may itself be corrected,
producing a linear chain. What is forbidden is a *cycle*. The repository walks
`reverses_id` from the proposed row before insert and rejects the write if it
revisits a row it has already seen; the walk is bounded by the chain length,
which is small by construction. It runs inside the same transaction as the
insert, so a concurrent writer cannot slip a cycle past the check.

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

### `cards` — from `CC Payments!H7:H10` (4 rows)

**The `CC Payments` tab is not empty.** An earlier draft recorded it as
"0 rows today — nothing to import". That is true only of the *payment rows*
(`A2:F10` are blank). The tab also carries a settings block to the right that
holds real, in-use configuration:

| Cell | Content |
|---|---|
| `H2:I2` | Salary Amount = `2250` |
| `H3:I3` | Salary Currency = `USD` |
| `H4:I4` | Salary Day = `27` |
| `H7:H10` | Cards: `ADIB CC`, `HSBC CC`, `CASHBACK CC`, `Valu CC` |

Dropping these would silently discard the feature-002 setup.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `name` | TEXT NOT NULL | `ADIB CC`, `HSBC CC`, `CASHBACK CC`, `Valu CC` |
| `limit_minor` | INTEGER | NULL — the sheet records no limit |
| `statement_day` | INTEGER | NULL — the sheet records none |
| `due_day` | INTEGER | NULL — the sheet records none |
| `sort_order` | INTEGER NOT NULL | `H7`…`H10` order |
| `created_at` | INTEGER NOT NULL | |

The three nullable columns exist per the feature-002 contract and import as
NULL. They are not invented defaults — the sheet has no value for them, and a
fabricated `statement_day` would be a derived value masquerading as a fact.

**Relationship to the two `Liability` accounts.** `Data!A13:A14` (`ADIB C.C`,
`HSBC C.C`) name the same two physical cards as `CC Payments!H7:H8`
(`ADIB CC`, `HSBC CC`), spelled differently, and `Total!I4:I5` (`CC ADIB`,
`CC HSBC`) name them a third way. The importer does **not** attempt to unify
them: it imports all three lists as written, because merging on a fuzzy name
match would be a guess, and a wrong guess silently moves money. Reconciling
the three spellings is a decision for the owner, recorded as D7.

### `card_payments` — from `CC Payments!A2:F10` (0 rows)
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `household_id` | TEXT NOT NULL FK | |
| `card_id` | TEXT NOT NULL FK cards | composite `(household_id, card_id)` |
| `due_on` | TEXT NOT NULL | |
| `amount_minor` | INTEGER NOT NULL | EGP piastres |
| `paid_at` | INTEGER | NULL = unpaid |
| `created_at` | INTEGER NOT NULL | |

Genuinely empty today. The table exists so feature 004 has somewhere to write.

### `income_settings` — from `CC Payments!I2:I4`
| Column | Type | Notes |
|---|---|---|
| `household_id` | TEXT PK FK | one row per household |
| `salary_minor` | INTEGER | in `salary_currency`'s minor unit — **not** always EGP |
| `salary_currency` | TEXT NOT NULL | `EGP` \| `USD` — CHECK constrained |
| `pay_day` | INTEGER | day of month |
| `created_at` | INTEGER NOT NULL | |
| `updated_at` | INTEGER NOT NULL | |

**`salary_currency` is required, and it is `USD` here.** An earlier draft typed
`salary_minor` as "EGP piastres" outright. The actual stored salary is
`2250 USD`, so that typing would have imported 2,250 USD as 22.50 EGP — a
2,000-fold error in the one figure the household budgets against. The column
pair follows the same rule as `transactions`: an amount is meaningless without
its currency.

Imports as `salary_minor = 225000`, `salary_currency = 'USD'`, `pay_day = 27`.

No `rate_id` is pinned here: unlike a transaction, a salary setting is a
standing configuration rather than a dated event, so it converts at the rate in
force on the day it is *displayed*, not a frozen one. D6 does not apply.

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
| `created_by` | TEXT FK users | NULL when `source = 'fetch'`; the `fetch` source is itself the attributable actor (FR-039) |
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
| `liquid_minor`, `investments_minor`, `property_paid_minor`, `short_term_liabilities_minor`, `remaining_installments_minor` | INTEGER NOT NULL | as recorded |
| `net_worth_excl_installments_minor` | INTEGER NOT NULL | the `History!G` figure — matches `Net Worth!B20` |
| `net_worth_incl_installments_minor` | INTEGER | NULL for imported rows; required for `source = 'app'` |
| `source` | TEXT NOT NULL | `imported` \| `app` |
| `created_at` | INTEGER NOT NULL | |

Exempt from the derive-don't-store rule — a snapshot is a dated historical
fact, not a cache (Principle I, FR-012).

**Neither net-worth column is named plain `net_worth_minor`.** D4 forbids
presenting either figure unqualified, and a column name is a presentation the
whole codebase reads. An earlier draft stored `net_worth_minor`, which would
have reintroduced through the snapshot table exactly the ambiguity D4 exists
to remove.

`History!G` is the *excluding-installments* figure — the sheet's `B20` — so it
imports into `net_worth_excl_installments_minor`. The including-installments
figure was never recorded historically and cannot be recovered: the sheet
stored only one number, and the installment schedule as it stood on
2026-08-17 is not in the dump. It imports NULL, and the reconciliation report
must not treat that NULL as a zero. Snapshots the application takes after
cutover record both, which is why the column is nullable rather than absent.

CHECK: `source = 'app'` ⟹ `net_worth_incl_installments_minor IS NOT NULL`.

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
