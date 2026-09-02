# The Recovered Model

Extracted 2026-08-27 from `sheet-dump.json`. This is the financial logic that
drives the application, written down for the first time. **707 formulas across
10 tabs reduce to roughly 25 distinct computations**, most of them one shape
repeated down a column.

Until now none of this existed anywhere but in spreadsheet cells.

## The dependency spine

Everything traces back to three rate cells:

```
Rates!B2  USD/EGP   =GOOGLEFINANCE("CURRENCY:USDEGP")   ← LIVE market feed
Rates!B3  Gold      7,500  (manual)
Rates!B4  Silver      102  (manual)
      │
      ├─→ Total!A2,B2,C2  ──┐
      └─→ Investment!A2,B2,C2 ─┤
                              ├─→ Total!E2,G2,I2   (non-investment, by class)
                              └─→ Investment!E2,H2,I2 (investment, by class)
                                        │
                    Data!A:E ───────────┘
                    (17 accounts: name, class, isInvestment, amount, date)
                                        │
                          Net Worth!B4:B8 ─→ B12 (TOTAL ASSETS)
                                                │
      Installments!A:E (56 rows) ─→ H2:H10 ─────┤
                                                ├─→ B17 (TOTAL LIABILITIES)
                    Total!I4:J10 ─→ K2 ─────────┘
                                                │
                                    B19 / B20 (two net worths)
                                                │
                                  Dashboard, History
```

**Consequence**: the entire net worth is downstream of a live market feed. It
changes on every recalculation, with no user action.

## Computations

### Holdings split by investment flag

The `Data` tab's investment checkbox partitions every holding. `Total` sums the
unchecked ones, `Investment` the checked ones — identical formulas, opposite
predicate.

```
Total!D2      = SUMIFS(Data!D:D, Data!B:B,"USD",   Data!C:C, FALSE)   native
Total!E2      = A2 * D2                                                → EGP
Total!F2/G2   = same for "Gold"     (native grams → EGP)
Total!H2/I2   = same for "Silver"
Total!J2      = SUMIFS(Data!D:D, Data!B:B,"EGP",  Data!C:C, FALSE)    (no conversion)
Total!K2      = SUM(J4:J10)                          short-term liabilities
Total!L2      = E2+G2+I2+J2-K2                       "Total of All in EGP"

Investment!*  = identical, with TRUE instead of FALSE
Investment!K2 = E2+H2+J2+I2                          total investments EGP
```

Note `Total!L2` **subtracts liabilities and excludes investments**. It is not
"all assets" despite the label.

### Installment summary — `Installments!H2:H10`

The only formulas that were already version-controlled (`Code.gs:88-97`).

```
H2  = SUM(C2:C500)                                    total scheduled
H3  = SUMIFS(C:C, E:E,"Yes")                          total paid
H4  = SUMIFS(C:C, E:E,"No")                           total remaining
H5  = MINIFS(B:B, E:E,"No", B:B,">="&TODAY())         next due date
H6  = SUMIFS(C:C, B:B,H5, E:E,"No")                   amount due that date
H7  = unpaid, TODAY() … EDATE(TODAY(),3)              due 3 months
H8  = unpaid, TODAY() … EDATE(TODAY(),6)              due 6 months
H9  = unpaid, TODAY() … EDATE(TODAY(),12)             due 12 months
H10 = unpaid, < TODAY()                               overdue
```

All six `TODAY()` calls evaluate in the **spreadsheet's** timezone. See Defect 2.

### Net worth — `Net Worth!B`

```
B4  = Total!J2         liquid EGP
B5  = Total!E2         USD → EGP
B6  = Total!G2         gold → EGP
B7  = Total!I2         silver → EGP
B8  = Investment!K2    investments
B9:B11                 property paid-to-date (hand-entered, the 3 yellow cells)
B12 = SUM(B4:B11)      TOTAL ASSETS
B15 = Total!K2         short-term liabilities
B16 = Installments!H4  remaining installments (to 2046)
B17 = B15 + B16        TOTAL LIABILITIES
B19 = B12 - B17        NET WORTH after all future installments
B20 = B12 - B15        NET WORTH excluding future installments
```

### Dashboard

```
B3  = 'Net Worth'!B20            headline net worth      ← B20, not B19
B4  = 'Net Worth'!B12            total assets
B5  = SUM('Net Worth'!B4:B7)     liquid
B6  = 'Net Worth'!B8             investments
B7  = Total!K2                   short-term liabilities
B8  = Installments!H4            remaining installments
B9  = Installments!H5            next due date
C9  = Installments!H6            next due amount
B10 = Installments!H9            due next 12 months
B11 = Installments!H10           overdue
B12 = Rates!B2                   USD rate

F2:F6   asset mix = Total!<class> + Investment!<class>, per class
I2:I22  unpaid by year, 21 rows:
        SUMIFS(Installments!C:C, B:B,">="&DATE(Hn,1,1),
                                 B:B,"<"&DATE(Hn+1,1,1), E:E,"No")
```

### Transactions

619 of the 707 formulas live here, in 7 shapes.

```
G2:G500 = IF($E2="","", IF($F2="USD", $E2*Rates!$B$2, $E2))     × 499
          amount converted to EGP at the LIVE rate — see Defect 3

J2      = DATE(2026,8,1)                 month spine start
J3:J25  = EDATE(J2,1)                    24 months FORWARD → Jul 2028
K       = SUMIFS(G, B,"Income",  A,">="&J, A,"<"&EDATE(J,1))
L       = SUMIFS(G, B,"Expense", A,">="&J, A,"<"&EDATE(J,1))
M       = K - L                          net saved
N       = IFERROR(M/K,"")                savings rate
```

The month spine runs **forward from Aug 2026**, so this is a forecast grid, not
a history. Only the first row has data.

### History

```
Row 2  = LIVE formulas mirroring Net Worth — NOT a snapshot
Row 3  = literal text "SNAPSHOTS ↓" — a separator
Row 4+ = stored snapshots written by takeSnapshot()
```

## Actual data volumes

| | Count |
|---|---|
| Accounts (`Data`) | 17 |
| Installments | 56 |
| Transactions | **1** |
| Stored snapshots | **1** (08/17/2026) |
| CC Payments rows | 0 (tab set up, never used) |
| Named ranges | 0 |

## Defects found

### 1. The app destroys the live USD rate feed — *live bug, ships today*

`Rates!B2` holds `=GOOGLEFINANCE("CURRENCY:USDEGP")`. It is **also** coloured
input-yellow, so the write-allowlist treats it as editable, and
`setRate('usd', v)` writes a literal number into it (`api.gs:659`).

The first time the USD rate is updated from the app, the formula is
overwritten with a static value and the live feed is gone permanently, with no
warning. Every downstream figure then silently freezes at that rate.

This is a v1.0.0 Principle II violation ("formulas … are never overwritten
under any circumstance"). The allowlist was derived from the yellow-cell
convention, and here the convention is simply wrong: the cell is marked
editable but holds a formula.

`Rates!C2` compounds it — it reads `08/17/2026` while `B2` is live, so the
"as of" date has been wrong for ten days.

### 2. Two different "today"

Spreadsheet timezone is `America/Los_Angeles`; the app's is `Africa/Cairo`.
Ten hours apart, so for ten hours of each day the six `TODAY()` formulas in
`Installments!H5:H10` and the overdue conditional format evaluate a different
date than the app does. Affects overdue counts and every due-window total.

*This dump was taken at 13:06 Cairo / 03:06 LA — both 2026-08-27 — so its
`TODAY()`-derived values are consistent.*

### 3. Historical transactions are revalued at today's rate

`Transactions!G` converts USD amounts at `Rates!$B$2`, the current live rate.
A transaction from last year is restated every time the market moves, so the
recorded EGP value of a past event is not stable. Rate history (US3) is the
fix, but adopting it changes historical figures — which reconciliation will
flag. Needs a decision.

### 4. Reconciliation is non-deterministic as it stands

Because `Rates!B2` is a live feed, `Total`, `Investment`, `Net Worth`,
`Dashboard`, `History` row 2 and `Transactions!G` all change between one
recalculation and the next. Golden tests must pin the USD rate to the value
captured in this dump — **50.2554** — or they will fail for reasons that have
nothing to do with the code.

### 5. `History` row 2 is not a snapshot

It is a live formula mirror of `Net Worth`. Under Q3-A ("import snapshots
verbatim") it must be **excluded**: importing it would store a derived value,
violating FR-012. Only row 4 is a genuine snapshot. There is exactly one.

## Decisions taken (2026-08-27)

- **Net worth → both figures, named distinctly.** `B20` (389,774) and `B19`
  (-7,824,831) are both exposed and both named. Neither is "net worth"
  unqualified, so the 8,214,605 of committed obligation stops being invisible.
- **USD rate → scheduled fetch writing a dated record.** The live lookup is
  replaced by a job that records a dated rate through the same path as a manual
  entry. Fixes Defects 3 and 4: figures stop moving on their own, and reading
  the same figure twice returns the same answer.
- **Historical conversion → frozen at the transaction date.** A USD transaction
  converts once, at the rate in force when it happened. The resulting
  difference from the spreadsheet is an accepted divergence, not a failure —
  the spreadsheet's behaviour is the defect being corrected.
