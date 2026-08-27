# Contract: Derivations

Every recovered spreadsheet computation, as a pure function. These are the
contracts golden tests assert against.

**Universal rules**

- Pure. No clock, no database, no I/O. `today` is always a parameter (R8).
- Inputs and outputs are integer minor units (R1). Never a float, never a
  string.
- Rounding is half-up to the target class's minor unit, applied at each
  conversion, not deferred (R2).
- A missing rate throws `MissingRateError`. It is never treated as zero
  (FR-019, FR-043).

**Golden fixture** — every expected value below comes from
`migration/sheet-dump.json`, with:

```
today    = 2026-08-27
USD/EGP  = 50.2554   (rate_minor 502554, scale 4)
Gold     = 7500.00   (rate_minor 750000, scale 2)
Silver   = 102.00    (rate_minor  10200, scale 2)
```

---

## `convert(quantityMinor, fromClass, rate) → EgpMinor`

Converts one holding to EGP piastres. `EGP → EGP` is identity.

| Input | Expected |
|---|---|
| 244400 cents USD | `12282420` (122,824.20) |
| 3600 cents USD | `180919` (1,809.19) |
| 22500 mg gold | `16875000` (168,750.00) |
| 750000 mg silver | `7650000` (76,500.00) |

## `holdingsByClass(accounts, rates, { isInvestment, today }) → Record<AssetClass, { nativeMinor, egpMinor }>`

Partitions on `is_investment` — this is the sole difference between the sheet's
`Total` and `Investment` tabs, which are otherwise identical formulas.

Replaces `Total!D2:J2` and `Investment!D2:J2`.

| `isInvestment` | Class | native | egpMinor |
|---|---|---|---|
| false | USD | 244400 | `12282420` |
| false | EGP | 6700000 | `6700000` |
| false | GOLD | 0 | `0` |
| false | SILVER | 0 | `0` |
| true | USD | 3600 | `180919` |
| true | GOLD | 22500 | `16875000` |
| true | SILVER | 750000 | `7650000` |
| true | EGP | 3300000 | `3300000` |

## `shortTermLiabilities(liabilities) → EgpMinor`

Replaces `Total!K2 = SUM(J4:J10)`. Expected: `8010900` (80,109.00).

## `totalOfAll(holdings, liabilities) → EgpMinor`

Replaces `Total!L2 = E2+G2+I2+J2-K2`. Non-investment holdings **minus**
short-term liabilities, **excluding** investments — despite the "Total of All"
label. Expected: `10971520` (109,715.20).

## `investmentTotal(holdings) → EgpMinor`

Replaces `Investment!K2`. Expected: `28005919` (280,059.19).

## `netWorth(input) → { totalAssets, shortTermLiabilities, remainingInstallments, totalLiabilities, excludingInstallments, includingInstallments }`

Replaces `Net Worth!B12:B20`. **Returns both figures** (D4, FR-036) — neither
is named plain "net worth", and `excludingInstallments` must never be presented
without stating what it omits (FR-037).

| Field | Sheet cell | Expected |
|---|---|---|
| `totalAssets` | `B12` | `46988339` (469,883.39) |
| `shortTermLiabilities` | `B15` | `8010900` (80,109.00) |
| `remainingInstallments` | `B16` | `821460500` (8,214,605.00) |
| `totalLiabilities` | `B17` | `829471400` (8,294,714.00) |
| `excludingInstallments` | `B20` | `38977439` (389,774.39) |
| `includingInstallments` | `B19` | `-782483061` (−7,824,830.61) |

`totalAssets` accumulates four conversions, so it reconciles under a ±4 piastre
tolerance; observed divergence from the sheet's float chain is 0.2 piastres
(R2).

## `installmentSummary(installments, today) → { ... }`

Replaces `Installments!H2:H10`. Every field below is `TODAY()`-dependent in the
sheet and takes `today` explicitly here.

| Field | Cell | Rule | Expected at 2026-08-27 |
|---|---|---|---|
| `totalScheduled` | `H2` | sum all | `919871100` (9,198,711) |
| `totalPaid` | `H3` | sum where paid | `98410600` (984,106) |
| `totalRemaining` | `H4` | sum where unpaid | `821460500` (8,214,605) |
| `nextDueOn` | `H5` | min `due_on` where unpaid and ≥ today | `2026-09-15` |
| `nextAmountDue` | `H6` | sum unpaid on `nextDueOn` | `1475300` (14,753) |
| `due3m` | `H7` | unpaid, today ≤ due ≤ today+3mo | `24619600` (246,196) |
| `due6m` | `H8` | unpaid, today ≤ due ≤ today+6mo | `35499200` (354,992) |
| `due12m` | `H9` | unpaid, today ≤ due ≤ today+12mo | `109762200` (1,097,622) |
| `overdue` | `H10` | unpaid, due < today | `0` |

`EDATE` semantics: adding *n* months clamps to the last valid day of the target
month (31 Jan + 1 month → 28/29 Feb). Must match, or the 3/6/12-month windows
will disagree at month ends.

## `unpaidByYear(installments) → { year, amountMinor }[]`

Replaces `Dashboard!I2:I22` — 21 rows of
`SUMIFS(..., ">="&DATE(y,1,1), "<"&DATE(y+1,1,1), unpaid)`.
Calendar-year buckets, not rolling windows. The sheet's spine runs 2025–2045.

| Year | Expected `amountMinor` | EGP |
|---|---|---|
| 2025 | `0` | 0 |
| 2026 | `26094900` | 260,949 |
| 2027 | `153188000` | 1,531,880 |
| 2028 | `74732200` | 747,322 |
| 2029 | `135020000` | 1,350,200 |
| 2030 | `64833500` | 648,335 |
| 2031 | `66097500` | 660,975 |
| 2032 | `65242500` | 652,425 |
| 2033 | `62458000` | 624,580 |
| 2034 | `62929000` | 629,290 |
| 2035 | `64185000` | 641,850 |
| 2036 | `46680000` | 466,800 |
| 2037–2045 | `0` | 0 |

**Cross-check**: the buckets sum to 8,214,606, against `installmentSummary
.totalRemaining` of 8,214,605 — a 1 EGP display-rounding artifact in the sheet,
not a missing installment. The derivation must make these agree exactly, since
both are pure sums and neither gets a tolerance (FR-029).

**Note on the sheet's label**: `Net Worth!B16` reads "Remaining property
installments (to 2046)", but every unpaid installment falls in 2026–2036 and
the bucket spine stops at 2045. The label is stale, not a coverage gap.

## `assetMix(totalHoldings, investmentHoldings) → { class, egpMinor }[]`

Replaces `Dashboard!F2:F6 = Total!<class> + Investment!<class>` — the combined
position per class, across both partitions.

## `transactionEgp(transaction, rate) → EgpMinor`

Replaces `Transactions!G`. Uses the rate pinned by `transaction.rate_id` — the
rate in force on `occurred_on` — **not** the current rate (D6, FR-042).

**Registered divergence**: the sheet computes this at the live rate, so its
value for any past USD transaction drifts with the market. Reported as
`DIVERGED`, not `FAIL` (R6).

## `monthlyRollup(transactions, months) → { month, incomeMinor, expenseMinor, netMinor, savingsRate }[]`

Replaces `Transactions!J:N`. The sheet's spine runs **forward** 24 months from
2026-08-01 to 2028-07-01, so it is a forecast grid rather than a history. The
function takes its month list as a parameter instead of hard-coding a spine.

`savingsRate = net / income`, and is **null** when income is zero — the sheet
returns `""` via `IFERROR`, which must not become `0`.

Expected at Aug 2026: income `502600`, expense `0`, net `502600`, rate `1.0`.
All other months zero, rate null.
