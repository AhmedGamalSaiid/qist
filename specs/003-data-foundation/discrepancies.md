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
