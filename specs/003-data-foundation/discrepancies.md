# Discrepancy register

Every `FAIL` line on the reconciliation report gets an entry here recording
**which side was correct and why** (FR-010, US1 acceptance scenario 4).

Resolutions are read from this file, never inferred by the reporter.

| Resolution | Meaning | Blocks completion |
|---|---|---|
| `sheet-correct` | The spreadsheet is right and the port is wrong. Fix the code. | **yes** |
| `computed-correct` | The spreadsheet was quietly wrong. The line is reclassified as a divergence and needs the reason below. | no |
| `unresolved` | Not yet decided. | **yes** |

**The expected value is never edited to match the computed one.** Changing the
number a test checks against is the cheapest way to make a red report green and
it turns the parity proof into a tautology (FR-010). A `FAIL` is resolved by
fixing the code, or by recording — in writing, here — that the sheet was wrong.

## Open discrepancies

| sheet_ref | resolution | reason |
|---|---|---|

*(Empty. The report has no `FAIL` lines against the committed dump.)*

## Resolved source-data defects

Not reconciliation failures. These are places where the **spreadsheet itself**
holds two contradictory records and the owner has since said which is right.
The reconciliation report is unaffected: it proves parity with the sheet, and
parity still holds — the sheet is simply wrong about its own data here.

The table below is **read by the reconciler** and printed against the matching
line in the *Unreachable values* section, so a reader of the report sees the
resolution rather than an open question. Columns are
`source_ref | resolution | authoritative_minor | reason`.

| source_ref | resolution | authoritative_minor | reason |
|---|---|---|---|
| `Data!D13` | source-corrected | 60000 | One physical ADIB card is named three ways — `ADIB C.C` (`Data!A13`), `ADIB CC` (`CC Payments!H7`) and `CC ADIB` (`Total!I4`). The owner confirms these are one card, that the `0.00 EGP` at `Total!J4` was entered incorrectly, and that the real balance is the `600.00 EGP` here. The `0.00` is not a separate liability and must not be carried as one. Feature 004 holds one ADIB entity at 600.00 EGP with no double-counting. |

### D7 — the ADIB card balance (resolved 2026-08-27)

One physical card, named three ways, carrying two balances:

| Source | Name | Balance | Read by a formula? |
|---|---|---|---|
| `Data!A13` / `D13` | `ADIB C.C` | **600.00 EGP** | no — listed under *Unreachable values* |
| `CC Payments!H7` | `ADIB CC` | card record, no balance | n/a |
| `Total!I4` / `J4` | `CC ADIB` | 0.00 EGP | yes — feeds `Total!K2`, and net worth |

**Owner's decision: 600.00 EGP is correct.** The `0.00 EGP` at `Total!J4` was
**entered incorrectly**. It is *not* a separate liability, *not* a second
balance, and must not be carried as either. The final data model holds **one
ADIB card/entity at 600.00 EGP**, with no double-counting between `cards`, the
`liability`-kind `accounts` row and the `liabilities` row.

Consequence: the sheet understates short-term liabilities by 600 EGP, and both
net-worth figures are overstated by the same amount. That is a defect in the
source, not in the port, so **no figure in this feature's reconciliation report
changes** — altering a reconciled number to reflect it would break the one
thing the report exists to prove.

The correction lands in feature 004, where the three names resolve to a single
card entity and the duplicate `liabilities` row `CC ADIB` stops double-counting.
It is applied as a recorded correction with an audit entry, never as an in-place
edit (FR-013, FR-015).

The same three-way naming applies to HSBC (`HSBC C.C` / `HSBC CC` / `CC HSBC`),
but both its sources record 0, so merging HSBC changes no figure.

#### D7 anchor ids (feature 004, `lib/data/consolidation.ts`)

Deterministic functions of the frozen dump (`lib/import/ids.ts`, `derivedId`/
`derivedHouseholdId`) — computed once here and pinned as a constant block in
`applyCardConsolidation`. Valid while the dump is frozen and cutover is
deferred (research.md R6); a fresh re-import of the same dump reproduces
these exact ids.

`householdId = 194NRCNHWEBDB912QKQTTGVT5F`

| Card | Table | Imported name | Imported value | Row id |
|---|---|---|---|---|
| ADIB | `cards` | `ADIB CC` | — | `26HTBHY5WTV9JXCWQ51ES08X7R` |
| ADIB | `liabilities` | `CC ADIB` | 0.00 EGP | `2VCEP5AERT8V960FZ16VJR3XWT` |
| ADIB | `accounts` (unreachable) | `ADIB C.C` | 600.00 EGP | `7WW6SB50M15K858W035D1NQ8R8` |
| HSBC | `cards` | `HSBC CC` | — | `6VQ21EMYXDPHGR8JEP672AQH4A` |
| HSBC | `liabilities` | `CC HSBC` | 0.00 EGP | `5C28XRHRGS7W34FW3K4XB3HAT1` |
| HSBC | `accounts` (unreachable) | `HSBC C.C` | 0.00 EGP | `4H0DXJ617TMX941Q2Z9PKAHF0V` |
