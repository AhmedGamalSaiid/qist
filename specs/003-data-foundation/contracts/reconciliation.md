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

| Figure | Divergence | Authority |
|---|---|---|
| `Transactions!G*` | Frozen at the transaction's own rate | D6, FR-042 |
| `History` row 2 | Excluded from import | FR-012 — a live mirror, not a snapshot |
| Net worth headline | Both `B19` and `B20` exposed | D4, FR-036 |
| `Rates!B2` | Dated record replaces the live lookup | D5, FR-041 |

## Report shape

One line per figure:

```
sheet_ref        Total!L2
label            Total of All in EGP
sheet_value      109715.20
computed_value   109715.20
difference       0
conversions      2
tolerance        ±2 piastres
verdict          PASS
note             —
```

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
