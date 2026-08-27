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

### D7 — the ADIB card balance (resolved 2026-08-27)

One physical card, named three ways, carrying two balances:

| Source | Name | Balance | Read by a formula? |
|---|---|---|---|
| `Data!A13` / `D13` | `ADIB C.C` | **600.00 EGP** | no — listed under *Unreachable values* |
| `CC Payments!H7` | `ADIB CC` | card record, no balance | n/a |
| `Total!I4` / `J4` | `CC ADIB` | 0.00 EGP | yes — feeds `Total!K2`, and net worth |

**Owner's decision: 600.00 EGP is correct.** `Total!J4` is stale.

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
