# Specification Quality Checklist: Data Foundation Migration

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-27
**Last validated**: 2026-08-27 (after cross-artifact review against the dump)
**Feature**: [spec.md](../spec.md)

## Validation history

| Round | Outcome |
|---|---|
| Clarification round | Passed |
| Review against `sheet-dump.json` | **8 blocking issues**, all resolved; one new spreadsheet defect found (D7). See *Revision* in [plan.md](../plan.md). |

The second round is the reason for the checks added below. Every item in the
original list passed while the spec still asserted goldens taken from rounded
display strings, a schema that rejected two real rows, and a tab recorded as
empty that held the household's salary. A checklist of *properties* did not
catch any of it; the checks below are checks against the *source*.

## Source fidelity *(added after review)*

- [x] Every expected value traces to a dump `value` field, not a `display` string (FR-046)
- [x] Every value the source stores is imported, including values no formula reads (FR-044, D7)
- [x] Every enum in the spec covers every value the source's data validation permits
- [x] Every tab was read in full, not only the columns its title suggests
- [x] Every monetary field carries its currency rather than assuming one (FR-047)
- [x] Row counts in the spec are counted from the dump, not carried forward from a draft
- [x] Claims of the form "N computations" are backed by a generated artifact, not prose
- [x] Registered divergences state whether they change a number *today*
- [x] Constitution Check claims are supported by a resolved decision, not an open caveat

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**All items pass.** The specification is ready for `/speckit-plan`, which is
gated on `migration/sheet-dump.json` existing — the data model cannot be
written without the recovered formulas.

### Clarifications resolved (2026-08-27)

| # | Question | Resolution | Requirements |
|---|---|---|---|
| Q1 | Account balances: stated or derived? | Stated on import; derived available per account, opt-in | FR-024 – FR-028 |
| Q2 | Reconciliation: exact or tolerant? | Exact for sums/counts/carry-over; tolerance only for rate conversions, marked and measured | FR-029 – FR-031 |
| Q3 | Historical snapshots: verbatim or recomputed? | Verbatim, excluded from pass/fail | FR-032, FR-033 |

### Added after extraction reconnaissance

`dumpSummary()` surfaced a conflict between the spreadsheet's timezone
(`America/Los_Angeles`) and the application's (`Africa/Cairo`) — ten hours
apart, so the two disagree about the current date for roughly ten hours daily.
This produced FR-034, FR-035, SC-009, an edge case, an acceptance scenario, and
an amendment to the Assumptions permitting one deliberate pre-extraction change
to the spreadsheet.

It also established that 619 of the spreadsheet's 707 formulas sit in
`Transactions`, across six columns the existing data model does not document.
That is the single largest unknown this feature has to recover.

### Verification notes

- Technology-agnosticism checked by grep for stack terms (Cloudflare, D1,
  Drizzle, Next.js, React, SQL, TypeScript, ORM, API). Only false positives —
  "f*orm*ulas" matching `ORM`, and the extraction artifact's filename.
- The spec states that reconciliation proves *agreement*, not *correctness*, and
  provides for recording that the spreadsheet was wrong. Without this the
  feature would be committed to reproducing pre-existing spreadsheet bugs.
