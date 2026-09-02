# Specification Quality Checklist: Data Foundation Migration

**Purpose**: Validate specification completeness and quality, and the consistency of spec, plan and tasks with each other, before implementation begins
**Created**: 2026-08-27
**Last validated**: 2026-08-27 (after `/speckit-analyze` cross-artifact consistency review)
**Feature**: [spec.md](../spec.md)

## Validation history

| Round | Outcome |
|---|---|
| Clarification round | Passed |
| Review against `sheet-dump.json` | **8 blocking issues**, all resolved; one new spreadsheet defect found (D7). See *Revision* in [plan.md](../plan.md). |
| `/speckit-analyze` across spec, plan and tasks | **19 findings** (0 critical, 5 high), all resolved. No constitution violations. FR-044 split to FR-049; 3 tasks added; 4 requirements had zero task coverage. |

The second round is the reason for the *Source fidelity* checks. Every item in
the original list passed while the spec still asserted goldens taken from
rounded display strings, a schema that rejected two real rows, and a tab
recorded as empty that held the household's salary. A checklist of *properties*
did not catch any of it; those checks are checks against the *source*.

The third round is the reason for the *Cross-artifact consistency* checks. Both
earlier lists passed while two different requirements shared the id FR-044,
four requirements had no task at all, a contract defined five verdicts and the
task implementing it built four, and the Assumptions asserted a
pre-extraction fix that `research.md` records as never having happened. Each
artifact was internally sound; the defects lived *between* them, which is
where neither earlier list looked.

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

## Cross-artifact consistency *(added after `/speckit-analyze`)*

- [x] Every requirement id is unique — no id names two different requirements (FR-044 named two; the conversion one is now FR-049)
- [x] Every requirement and success criterion is **covered** by at least one task. 45 of 59 are cited by id; the other 14 map unambiguously to a task that implements them without naming the id (e.g. FR-006 to T066, FR-028 to T079, SC-001 to T065/T066). Before this round, FR-007, FR-010, FR-035 and SC-009 were covered by nothing at all
- [x] Every verdict, field and enum a contract defines appears in the task that implements it (`CARRIED` and the nine-field report line were contract-only)
- [x] Every requirement citation in a task points at the requirement that actually states it (T027 cited FR-016 for the audit log; FR-013 is the one that mandates it)
- [x] Every command a task invokes is created by some task (`coverage:generate` was invoked by T013 and created nowhere)
- [x] No assumption asserts as fact something `research.md` or the dump contradicts (the pre-extraction timezone fix never happened)
- [x] Every entity in `data-model.md` appears in the spec's Key Entities (five did not, including `income_settings` and its salary currency)
- [x] One concept carries one name across spec, plan, tasks and schema (Entry vs transaction)
- [x] Every numeric expected value states its units (`فرش` at "60,000" admitted both EGP and minor units)
- [x] Every Constitution Check claim names what enforces it, not merely that it holds (`decimal.js` was asserted and unenforced)
- [x] Requirements stating the general form of a more specific one say so, rather than reading as independent duplicates (FR-017/018/019 vs FR-038/042/043)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — two deliberate exceptions, disclosed under *Verification notes*
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

**All items pass.** The specification, plan and tasks are mutually consistent
and the feature is ready for `/speckit-implement`. `migration/sheet-dump.json`
exists, and `plan.md`, `data-model.md`, `contracts/` and `tasks.md` are all
written; `contracts/coverage.md` is generated by T012–T013 during
implementation and is the one design artifact still outstanding by design.

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
This produced FR-034, FR-035, SC-009, an edge case and an acceptance scenario.

An earlier draft of the Assumptions also recorded a deliberate pre-extraction
correction of the spreadsheet's timezone. **It never happened** — the committed
dump still records `America/Los_Angeles`, as `research.md` R8 states. The dump
is nonetheless safe, having been taken at 13:06 Cairo / 03:06 LA, both
2026-08-27; but that is a property of when it was taken rather than of the
process, which is what FR-048's preflight exists to check. The assumption has
been corrected to say so.

It also established that 619 of the spreadsheet's 707 formulas sit in
`Transactions`, across six columns the existing data model does not document.
That is the single largest unknown this feature has to recover.

### Verification notes

- Technology-agnosticism checked by grep for stack terms (Cloudflare, D1,
  Drizzle, Next.js, React, SQL, TypeScript, ORM, Vitest, SQLite, Worker). Two
  real hits, both deliberate: "a deployed Worker and a Cron trigger" in FR-039
  and in *Deferred*, naming the deployment target this feature does **not**
  build in order to explain where the scheduled rate fetch lands. A scope
  boundary cannot be drawn without naming what is on the other side of it.
  Everything else was a false positive — "f*orm*ulas" matching `ORM`, and the
  extraction artifact's filename. An earlier version of this note recorded no
  real hits, which was wrong.
- The spec states that reconciliation proves *agreement*, not *correctness*, and
  provides for recording that the spreadsheet was wrong. Without this the
  feature would be committed to reproducing pre-existing spreadsheet bugs.
