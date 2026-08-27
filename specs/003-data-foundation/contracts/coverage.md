# Coverage matrix

**GENERATED** by `npm run coverage:generate` — do not edit by hand.
`npm run coverage:check` regenerates this file and fails on any difference,
so a hand edit is reported as drift. Owner assignments live in
[`lib/reconcile/ownership.ts`](../../../lib/reconcile/ownership.ts).

Source dump: `migration/sheet-dump.json`, extracted 2026-08-27T10:06:31.254Z.

## Measured totals

| Measure | Value |
|---|---|
| Formula cells in the dump | 707 |
| Formula cells accounted for | 707 |
| Distinct formula shapes | 72 |
| Shapes excluded with a reason | 8 |
| Shapes owned by a derivation | 64 |

The `shape` column is the formula in R1C1 form, relative to the cell that holds it.
Two cells share a shape when one is a fill of the other, which is how 707
formula cells collapse to a countable number of computations.

## Matrix

| range | count | shape | owner | reason | verdict |
|---|---:|---|---|---|---|
| `Dashboard!F2` | 1 | `=Total!R[0]C[4]+Investment!R[0]C[4]` | assetMix | — | PASS |
| `Dashboard!I2:I22` | 21 | `=SUMIFS(Installments!R2C3:R500C3,Installments!R2C2:R500C2,">="&DATE(R[0]C[-1],1,1),Installments!R2C2:R500C2,"<"&DATE(R[0]C[-1]+1,1,1),Installments!R2C5:R500C5,"No")` | unpaidByYear | — | PASS |
| `Dashboard!B3` | 1 | `='Net Worth'!R[17]C[0]` | netWorth.excludingInstallments | — | PASS |
| `Dashboard!F3` | 1 | `=Total!R[-1]C[-1]+Investment!R[-1]C[-1]` | assetMix | — | PASS |
| `Dashboard!B4` | 1 | `='Net Worth'!R[8]C[0]` | netWorth.totalAssets | — | PASS |
| `Dashboard!F4` | 1 | `=Total!R[-2]C[1]+Investment!R[-2]C[2]` | assetMix | — | PASS |
| `Dashboard!B5` | 1 | `=SUM('Net Worth'!R[-1]C[0]:R[2]C[0])` | liquidTotal | — | PASS |
| `Dashboard!F5` | 1 | `=Total!R[-3]C[3]+Investment!R[-3]C[3]` | assetMix | — | PASS |
| `Dashboard!B6` | 1 | `='Net Worth'!R[2]C[0]` | investmentTotal | — | PASS |
| `Dashboard!F6` | 1 | `=SUM('Net Worth'!R[3]C[-4]:R[5]C[-4])` | assetMix | — | PASS |
| `Dashboard!B7` | 1 | `=Total!R[-5]C[9]` | shortTermLiabilities | — | PASS |
| `Dashboard!B8:B9` | 2 | `=Installments!R[-4]C[6]` | installmentSummary | — | PASS |
| `Dashboard!C9` | 1 | `=Installments!R[-3]C[5]` | installmentSummary.nextAmountDue | — | PASS |
| `Dashboard!B10:B11` | 2 | `=Installments!R[-1]C[6]` | installmentSummary | — | PASS |
| `Dashboard!B12` | 1 | `=Rates!R[-10]C[0]` | rateAsOf | — | PASS |
| `Total!A2` | 1 | `=Rates!R[0]C[1]` | rateAsOf | — | PASS |
| `Total!B2` | 1 | `=Rates!R[1]C[0]` | rateAsOf | — | PASS |
| `Total!C2` | 1 | `=Rates!R[2]C[-1]` | rateAsOf | — | PASS |
| `Total!D2` | 1 | `=SUMIFS( Data!R[0]C[0]:R[998]C[0], Data!R[0]C[-2]:R[998]C[-2], "USD",Data!R[0]C[-1]:R[998]C[-1], FALSE())` | holdingsByClass | — | PASS |
| `Total!E2` | 1 | `=R[0]C[-4]*R[0]C[-1]` | holdingsByClass | — | PASS |
| `Total!F2` | 1 | `=SUMIFS(  Data!R[0]C[-2]:R[998]C[-2], Data!R[0]C[-4]:R[998]C[-4], "Gold",Data!R[0]C[-3]:R[998]C[-3], FALSE())` | holdingsByClass | — | PASS |
| `Total!G2` | 1 | `=R[0]C[-5]*R[0]C[-1]` | holdingsByClass | — | PASS |
| `Total!H2` | 1 | `=SUMIFS(  Data!R[0]C[-4]:R[998]C[-4], Data!R[0]C[-6]:R[998]C[-6], "Silver",Data!R[0]C[-5]:R[998]C[-5], FALSE())` | holdingsByClass | — | PASS |
| `Total!I2` | 1 | `=R[0]C[-6]*R[0]C[-1]` | holdingsByClass | — | PASS |
| `Total!J2` | 1 | `=SUMIFS( Data!R[0]C[-6]:R[998]C[-6], Data!R[0]C[-8]:R[998]C[-8], "EGP",Data!R[0]C[-7]:R[998]C[-7], FALSE())` | holdingsByClass | — | PASS |
| `Total!K2` | 1 | `=SUM(R[2]C[-1]:R[8]C[-1])` | shortTermLiabilities | — | PASS |
| `Total!L2` | 1 | `=R[0]C[-7]+R[0]C[-5]+R[0]C[-3]+R[0]C[-2]-R[0]C[-1]` | totalOfAll | — | PASS |
| `Installments!H2` | 1 | `=SUM(R[0]C[-5]:R[498]C[-5])` | installmentSummary.totalScheduled | — | PASS |
| `Installments!H3` | 1 | `=SUMIFS(R[-1]C[-5]:R[497]C[-5],R[-1]C[-3]:R[497]C[-3],"Yes")` | installmentSummary.totalPaid | — | PASS |
| `Installments!H4` | 1 | `=SUMIFS(R[-2]C[-5]:R[496]C[-5],R[-2]C[-3]:R[496]C[-3],"No")` | installmentSummary.totalRemaining | — | PASS |
| `Installments!H5` | 1 | `=MINIFS(R[-3]C[-6]:R[495]C[-6],R[-3]C[-3]:R[495]C[-3],"No",R[-3]C[-6]:R[495]C[-6],">="&TODAY())` | installmentSummary.nextDueOn | — | PASS |
| `Installments!H6` | 1 | `=SUMIFS(R[-4]C[-5]:R[494]C[-5],R[-4]C[-6]:R[494]C[-6],R[-1]C[0],R[-4]C[-3]:R[494]C[-3],"No")` | installmentSummary.nextAmountDue | — | PASS |
| `Installments!H7` | 1 | `=SUMIFS(R[-5]C[-5]:R[493]C[-5],R[-5]C[-3]:R[493]C[-3],"No",R[-5]C[-6]:R[493]C[-6],">="&TODAY(),R[-5]C[-6]:R[493]C[-6],"<="&EDATE(TODAY(),3))` | installmentSummary.due3m | — | PASS |
| `Installments!H8` | 1 | `=SUMIFS(R[-6]C[-5]:R[492]C[-5],R[-6]C[-3]:R[492]C[-3],"No",R[-6]C[-6]:R[492]C[-6],">="&TODAY(),R[-6]C[-6]:R[492]C[-6],"<="&EDATE(TODAY(),6))` | installmentSummary.due6m | — | PASS |
| `Installments!H9` | 1 | `=SUMIFS(R[-7]C[-5]:R[491]C[-5],R[-7]C[-3]:R[491]C[-3],"No",R[-7]C[-6]:R[491]C[-6],">="&TODAY(),R[-7]C[-6]:R[491]C[-6],"<="&EDATE(TODAY(),12))` | installmentSummary.due12m | — | PASS |
| `Installments!H10` | 1 | `=SUMIFS(R[-8]C[-5]:R[490]C[-5],R[-8]C[-3]:R[490]C[-3],"No",R[-8]C[-6]:R[490]C[-6],"<"&TODAY())` | installmentSummary.overdue | — | PASS |
| `Investment!A2` | 1 | `=Rates!R[0]C[1]` | rateAsOf | — | PASS |
| `Investment!B2` | 1 | `=Rates!R[1]C[0]` | rateAsOf | — | PASS |
| `Investment!C2` | 1 | `=Rates!R[2]C[-1]` | rateAsOf | — | PASS |
| `Investment!D2` | 1 | `=SUMIFS( Data!R[0]C[0]:R[998]C[0], Data!R[0]C[-2]:R[998]C[-2], "USD",Data!R[0]C[-1]:R[998]C[-1], TRUE())` | holdingsByClass | — | PASS |
| `Investment!E2` | 1 | `=R[0]C[-4]*R[0]C[-1]` | holdingsByClass | — | PASS |
| `Investment!F2` | 1 | `=SUMIFS(  Data!R[0]C[-2]:R[998]C[-2], Data!R[0]C[-4]:R[998]C[-4], "Gold",Data!R[0]C[-3]:R[998]C[-3], TRUE())` | holdingsByClass | — | PASS |
| `Investment!G2` | 1 | `=SUMIFS(  Data!R[0]C[-3]:R[998]C[-3], Data!R[0]C[-5]:R[998]C[-5], "Silver",Data!R[0]C[-4]:R[998]C[-4], TRUE())` | holdingsByClass | — | PASS |
| `Investment!H2:I2` | 2 | `=R[0]C[-6]*R[0]C[-2]` | holdingsByClass | — | PASS |
| `Investment!J2` | 1 | `=SUMIFS( Data!R[0]C[-6]:R[998]C[-6], Data!R[0]C[-8]:R[998]C[-8], "EGP",Data!R[0]C[-7]:R[998]C[-7], TRUE())` | holdingsByClass | — | PASS |
| `Investment!K2` | 1 | `=R[0]C[-6]+R[0]C[-3]+R[0]C[-1]+R[0]C[-2]` | investmentTotal | — | PASS |
| `Rates!B2` | 1 | `=GOOGLEFINANCE("CURRENCY:USDEGP")` | EXCLUDED | A live GOOGLEFINANCE lookup, replaced by dated rate records (D5, FR-041). The value captured in the dump imports as the 2026-08-17 USD rate; no stored column may hold a live external lookup. Reported under Behavioural divergences. | — |
| `Net Worth!B4` | 1 | `=Total!R[-2]C[8]` | holdingsByClass | — | PASS |
| `Net Worth!B5` | 1 | `=Total!R[-3]C[3]` | holdingsByClass | — | PASS |
| `Net Worth!B6` | 1 | `=Total!R[-4]C[5]` | holdingsByClass | — | PASS |
| `Net Worth!B7` | 1 | `=Total!R[-5]C[7]` | holdingsByClass | — | PASS |
| `Net Worth!B8` | 1 | `=Investment!R[-6]C[9]` | investmentTotal | — | PASS |
| `Net Worth!B12` | 1 | `=SUM(R[-8]C[0]:R[-1]C[0])` | netWorth.totalAssets | — | PASS |
| `Net Worth!B15` | 1 | `=Total!R[-13]C[9]` | netWorth.shortTermLiabilities | — | PASS |
| `Net Worth!B16` | 1 | `=Installments!R[-12]C[6]` | netWorth.remainingInstallments | — | PASS |
| `Net Worth!B17` | 1 | `=R[-2]C[0]+R[-1]C[0]` | netWorth.totalLiabilities | — | PASS |
| `Net Worth!B19` | 1 | `=R[-7]C[0]-R[-2]C[0]` | netWorth.includingInstallments | — | PASS |
| `Net Worth!B20` | 1 | `=R[-8]C[0]-R[-5]C[0]` | netWorth.excludingInstallments | — | PASS |
| `Transactions!G2:G500` | 499 | `=IF(R[0]C5="","",IF(R[0]C6="USD",R[0]C5*Rates!R2C2,R[0]C5))` | transactionEgp | — | PASS |
| `Transactions!J2` | 1 | `=DATE(2026,8,1)` | monthlyRollup.months | — | PASS |
| `Transactions!K2:K25` | 24 | `=SUMIFS(R2C7:R500C7,R2C2:R500C2,"Income",R2C1:R500C1,">="&R[0]C10,R2C1:R500C1,"<"&EDATE(R[0]C10,1))` | monthlyRollup.incomeMinor | — | PASS |
| `Transactions!L2:L25` | 24 | `=SUMIFS(R2C7:R500C7,R2C2:R500C2,"Expense",R2C1:R500C1,">="&R[0]C10,R2C1:R500C1,"<"&EDATE(R[0]C10,1))` | monthlyRollup.expenseMinor | — | PASS |
| `Transactions!M2:M25` | 24 | `=R[0]C[-2]-R[0]C[-1]` | monthlyRollup.netMinor | — | PASS |
| `Transactions!N2:N25` | 24 | `=IFERROR(R[0]C[-1]/R[0]C[-3],"")` | monthlyRollup.savingsRate | — | PASS |
| `Transactions!J3:J25` | 23 | `=EDATE(R[-1]C[0],1)` | monthlyRollup.months | — | PASS |
| `History!A2` | 1 | `=TODAY()` | EXCLUDED | History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012). | — |
| `History!B2` | 1 | `=SUM('Net Worth'!R[2]C[0]:R[5]C[0])` | EXCLUDED | History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012). | — |
| `History!C2` | 1 | `='Net Worth'!R[6]C[-1]` | EXCLUDED | History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012). | — |
| `History!D2` | 1 | `=SUM('Net Worth'!R[7]C[-2]:R[9]C[-2])` | EXCLUDED | History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012). | — |
| `History!E2` | 1 | `='Net Worth'!R[13]C[-3]` | EXCLUDED | History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012). | — |
| `History!F2` | 1 | `='Net Worth'!R[14]C[-4]` | EXCLUDED | History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012). | — |
| `History!G2` | 1 | `='Net Worth'!R[18]C[-5]` | EXCLUDED | History row 2 is a live formula mirror of Net Worth, not a snapshot (FR-012). | — |
