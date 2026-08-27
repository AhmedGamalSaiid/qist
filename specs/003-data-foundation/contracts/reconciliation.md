# Contract: Reconciliation Report

The artifact that decides whether the migration may complete (Principle X,
FR-006, FR-009).

## Verdicts

| Verdict | Meaning | Blocks completion |
|---|---|---|
| `PASS` | Computed equals the spreadsheet exactly | no |
| `PASS (tolerance)` | Differs within the allowance, and by how much | no |
| `DIVERGED` | Deliberate correction of a known defect, registered in advance | no |
| `CARRIED` | Imported verbatim, not computed — nothing to compare | no |
| `FAIL` | Anything else | **yes** |

## Tolerance rules

- Figures produced by summation, counting or direct carry-over must match
  **exactly**. No tolerance (FR-029).
- Figures involving rate conversion may differ by up to **±1 minor unit per
  conversion in the derivation chain** (R2, FR-030).
- A tolerance pass must record the **observed difference**, not merely that it
  was within bounds (FR-031) — so systematic drift stays visible even when
  every individual line is inside the allowance.

## Registered divergences

A divergence must be registered **before** the report runs. One discovered
afterwards is a `FAIL`, not a divergence — otherwise the register becomes a
place to explain away surprises, which FR-010 forbids.

Each entry says whether it changes a number **today**, on the dump as
extracted. That distinction is load-bearing: a divergence registered with no
current numeric difference must not print a `DIVERGED` line, or the report
teaches its reader to skim past divergences as routine.

| Figure | Divergence | Numeric difference today | Authority |
|---|---|---|---|
| `Transactions!G*` | Frozen at the transaction's own rate | **None.** Verdict `PASS`. | D6, FR-042 |
| `Rates!B2` | Dated record replaces the live lookup | **None.** Verdict `PASS`. | D5, FR-041 |
| `History` row 2 | Excluded from import | **N/A** — not a figure. Reported as an explicit exclusion. | FR-012 — a live mirror, not a snapshot |
| Net worth headline | Both `B19` and `B20` exposed | **None.** Both figures reconcile against their own cells. | D4, FR-036 |

**Why `Transactions!G*` is a `PASS` today.** The sole imported rate
(`as_of = 2026-08-17`, USD/EGP `50.2554`) is also the live rate captured in the
dump, and the sole transaction is dated 2026-08-24. Frozen-rate and live-rate
evaluation therefore return the same `502554`, and the report must show
`PASS`, not `DIVERGED`. An earlier draft registered it as `DIVERGED` with no
expected differing value, which would have printed a divergence line whose
`difference` column read `0` — indistinguishable from a bug in the report.

The divergence D6 describes is **behavioural**: from the moment a second USD
rate is recorded, the sheet restates this past transaction and this system does
not. That is a real and intended difference in behaviour; it is simply not yet
a difference in any number. Both are true at once, and the report must say
which.

**Behavioural divergences.** A registered divergence whose numeric difference
is `None` is listed in a short section of its own, after the figure lines,
titled *Behavioural divergences (no current numeric difference)*. It is not a
verdict on a figure and does not count toward any verdict tally. Should such a
divergence ever produce a difference, the line moves into the figure table as a
`DIVERGED` — which is the point of registering it in advance.

## Report shape

One line per figure:

```
sheet_ref        Total!L2
label            Total of All in EGP
sheet_value      10971520
computed_value   10971520
difference       0
conversions      1
tolerance        ±1 piastre
verdict          PASS
note             —
```

`sheet_value` and `computed_value` are printed in **minor units**, taken from
the dump's `value` field — never from `display`, and never re-rounded for the
report (FR-046). A report that prints `109715.20` cannot show a one-piastre
disagreement, which is the only kind this report exists to catch. A
human-readable EGP rendering may follow in parentheses; it may not replace the
minor-unit figure.

`conversions` counts the rate conversions that **actually occurred** in
producing the figure, not the conversion terms present in the formula. `Total!L2`
is `E2+G2+I2+J2-K2`, which has three conversion-bearing terms (USD, gold,
silver), but gold and silver are zero on the non-investment partition and a
zero quantity converts exactly. So `conversions` is 1, and the tolerance is
±1 piastre.

This matters because tolerance is `±conversions` piastres (R2): counting
formula terms rather than real conversions inflates the allowance and lets a
genuine error hide inside it. A figure whose every conversion input is zero has
`conversions 0` and must reconcile **exactly**.

Grouped by source tab, in sheet order. The summary counts each verdict and
states the completion gate outcome. It must be readable start to finish by the
owner without assistance — SC-007 makes that a success criterion, not a nicety.

## Pinned inputs

Reconciliation runs against the dump, never a live spreadsheet:

```
dump          migration/sheet-dump.json  (2026-08-27T10:06:31Z)
today         2026-08-27
USD/EGP       50.2554
Gold EGP/g    7500.00
Silver EGP/g  102.00
```

The USD rate must be pinned because `Rates!B2` is a live market lookup —
unpinned, every downstream figure moves between recalculations and failures
become intermittent and unreproducible (R7).

## Coverage requirement

Every formula-bearing cell in the dump must appear on the report or be
explicitly excluded with a reason. **707 formulas** were extracted; the report
accounts for all of them, including the repeated per-row shapes, which may be
reported as a single line covering their range.

A figure the report does not mention is a coverage gap, and a coverage gap is a
`FAIL` of the report itself.

### The coverage matrix is an artifact, not an assertion

"707 formulas reduce to ~25 computations" is a claim this feature has asserted
in prose without anywhere demonstrating it. It cannot be checked by reading,
and `/speckit.tasks` cannot decompose against it: nothing says which cells a
given derivation is responsible for, so a formula-bearing range can be missed
with no test failing.

**The first task of the reconciliation phase builds
`contracts/coverage.md`** — generated from the dump, not written by hand:

| Column | Meaning |
|---|---|
| `range` | The cell range, e.g. `Dashboard!I2:I22` |
| `count` | How many formula cells it covers |
| `shape` | The formula with row/column indices normalised, so repeated rows collapse to one entry |
| `owner` | The derivation that replaces it, or `EXCLUDED` |
| `reason` | Required when `owner = EXCLUDED` |
| `verdict` | The expected report verdict for its figure |

The matrix is complete when `sum(count)` equals the dump's own formula total,
counted from the dump rather than copied from this sentence. Only then is the
computation count a measured number.

**Until the matrix exists, the count is unverified.** `recovered-model.md` says
"roughly 25"; `derivations.md` specifies 11 functions, several covering more
than one sheet range. These are not necessarily in conflict — a function may
own several ranges — but nothing currently demonstrates that they are not.
Prose elsewhere in this feature that states `25` as a settled fact overstates
what has been checked; the matrix is what settles it.

## Unreachable values

Distinct from a divergence: a value the source **stores but no formula reads**.
It changes no figure, so it has no verdict — but discarding it silently would
lose data the owner entered (FR-044, FR-045).

The report ends with an *Unreachable values* section, one line each:

```
source_ref       Data!D13
label            ADIB C.C (account, kind=liability)
stored_value     60000
read_by          — no formula in the workbook reads this cell
disposition      imported; excluded from asset totals by kind
```

Today this section has exactly one non-zero line, `Data!D13` at 600 EGP (D7).
`Data!D14` is zero and is listed too — a zero here is a fact about the source,
and omitting zeros would make the section's emptiness ambiguous.

An unreachable value is **not** a `FAIL`. But an unreachable value that is
*absent from this section* is, because it means the importer dropped it.
