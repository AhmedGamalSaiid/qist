# Feature Specification: Data Foundation Migration

**Feature Directory**: `specs/003-data-foundation`

**Feature Branch**: `003-data-foundation`, cut by hand from
`fix/code-review-findings` — no `before_specify` git hook is configured in this
project, so no branch was created automatically.

**Created**: 2026-08-27

**Status**: Ready for implementation. All 3 clarifications resolved 2026-08-27;
plan, contracts and tasks generated.

**Input**: Migrate the data foundation off Google Sheets onto a dedicated
application data store. Data layer only; no user interface ships in this
feature.

## Context

The application's financial logic does not exist in written form anywhere. It
lives in the spreadsheet's cell formulas. The current backend is almost
entirely a set of readers that copy out numbers the spreadsheet already
computed — net worth, asset mix by class, per-currency conversion, the
3/6/12-month due windows, overdue counts, monthly rollups. Only nine of those
formulas are version-controlled; the rest have never been recorded.

This feature therefore is not "change where the data is stored." It is
**recover an undocumented financial model, restate it as tested application
logic, and prove the restatement produces the same numbers as the original.**
The storage change is a consequence.

`migration/sheet-dump.json` — produced by the extraction tool — is the recovered
model and is treated throughout as the authoritative record of current
behaviour. Where this specification and the dump disagree, the dump wins.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trust that the migration did not change my numbers (Priority: P1)

The owner has years of financial records in a spreadsheet whose arithmetic they
have come to rely on. Before they will accept a replacement, they need to see —
not be told — that the new system produces the same figures. They open a
reconciliation report that lists every meaningful figure the spreadsheet
produces beside the figure the new system computes, with an explicit pass or
fail on each line, and they can see at a glance that nothing drifted.

**Why this priority**: Nothing else in the migration has any value if the
numbers are wrong, and the only opportunity to check is while the spreadsheet
is still available to check against. Every other story depends on this one.

**Independent Test**: Run the import against the extracted dump, then generate
the reconciliation report. The story is satisfied when every line passes and
each ported calculation has a test pinned to a real extracted value.

**Acceptance Scenarios**:

1. **Given** an extracted dump of the live spreadsheet, **When** the import runs
   and the reconciliation report is generated, **Then** every figure the
   spreadsheet computes appears as a line in the report beside the newly
   computed figure with a pass/fail verdict.
2. **Given** a reconciliation report containing at least one failing line,
   **When** anyone attempts to declare the migration complete, **Then** it is
   blocked, and the failure is recorded as an open discrepancy.
3. **Given** a ported calculation, **When** its tests run, **Then** at least one
   asserts against a real value taken from the extracted dump rather than an
   invented fixture.
4. **Given** a discrepancy between spreadsheet and computed figure, **When** it
   is investigated, **Then** the resolution records which of the two was
   correct and why — the expected value is never simply edited to match.
5. **Given** a figure produced by summing or counting, **When** it is
   reconciled, **Then** it must agree exactly; no tolerance applies.
6. **Given** a figure produced via a rate conversion that differs from the
   spreadsheet's by less than the stated tolerance, **When** it is reconciled,
   **Then** it passes but is marked as passing by tolerance and records the
   size of the difference.
7. **Given** a historical snapshot, **When** the report is generated, **Then**
   it is listed as carried-over historical fact and excluded from pass/fail
   rather than being recomputed and compared.
8. **Given** the extraction was taken while the spreadsheet and the application
   disagreed about the current date, **When** date-dependent figures are
   reconciled, **Then** the mismatch is identified as an extraction defect and
   a fresh dump is required — it is not recorded as a logic failure.

---

### User Story 2 - Correct a mistake without destroying the record (Priority: P2)

The owner records a payment, then realises the amount was wrong. Rather than
editing history — which in the spreadsheet silently changes every figure
derived from it, with no trace — they record a correction. The original entry
remains visible, the correction is linked to what it corrects, and every
derived figure reflects the net result. Later, they can see both that the
mistake happened and that it was corrected.

**Why this priority**: This is the integrity property the spreadsheet cannot
offer and the main reason the data is worth moving at all. It is P2 rather than
P1 only because it is worthless if the numbers do not reconcile first.

**Independent Test**: Record an entry, record a correction against it, and
confirm the original is still present, the link between them is explicit, and
derived totals reflect the net.

**Acceptance Scenarios**:

1. **Given** a recorded entry, **When** a correction is issued against it,
   **Then** the original remains intact and the correction carries an explicit
   reference to it.
2. **Given** a corrected entry, **When** any derived total is computed, **Then**
   it reflects the net of the original and its correction.
3. **Given** any change to stored data, **When** the change completes, **Then**
   a record exists of who made it, when, what changed, and what it was before.
4. **Given** a change that fails part-way, **When** the failure occurs, **Then**
   no partial effect is visible — the data is exactly as it was beforehand.
5. **Given** the migration has just run, **When** any account's balance is
   read, **Then** it is in stated mode and equals the spreadsheet's value
   exactly — migration alone changes no account's mode or amount.
6. **Given** an account in stated mode, **When** the owner switches it to
   derived, **Then** an opening balance and date are required, the switch is
   recorded, and no figure dated before the switch changes.
7. **Given** an account in derived mode, **When** its balance is reported,
   **Then** it equals its opening balance plus the net of entries since, and
   the report distinguishes it from a stated balance.

---

### User Story 3 - Ask what things were worth at the time (Priority: P3)

The owner holds assets in several currencies and metals. The spreadsheet stores
only the latest exchange rate for each, so once a rate is updated the previous
one is gone and any past figure that depended on it can no longer be
reproduced. After this feature, every rate the owner has ever recorded is
retained with the date it applied, so a past position can be recomputed at the
rate that actually applied then.

**Why this priority**: A genuine new capability rather than a port, and
valuable — but the migration succeeds without it, so it must not be allowed to
delay P1.

**Independent Test**: Record several rates for one asset on different dates,
then compute a figure as of an earlier date and confirm it uses the rate in
force on that date, not the latest.

**Acceptance Scenarios**:

1. **Given** several recorded rates for one asset across different dates,
   **When** a value is computed as of a past date, **Then** the rate in force on
   that date is used.
2. **Given** a new rate is recorded, **When** it is saved, **Then** previously
   recorded rates remain retrievable rather than being overwritten.
3. **Given** a date earlier than any recorded rate for an asset, **When** a
   value is requested as of that date, **Then** the system reports that no rate
   applies rather than silently substituting one.

---

### User Story 4 - Keep one household's finances away from another's (Priority: P3)

Today one person uses this. The owner may later grant access to a partner or
family member, and may eventually run separate households in the same system.
Each household's records must be unreachable from another's — not by the
discipline of whoever writes the next query, but structurally, so that the
unsafe query is not expressible.

**Why this priority**: There is exactly one opportunity to design this in
cheaply, and it is now. Retrofitting it later means migrating every table.

**Independent Test**: Create two households with records in each, then attempt
to read the second household's records while operating as the first, including
by supplying the other household's identifier directly as input.

**Acceptance Scenarios**:

1. **Given** records belonging to two households, **When** data is read while
   operating as one of them, **Then** only that household's records are
   returned.
2. **Given** a request that supplies another household's identifier as input,
   **When** it is processed, **Then** the supplied identifier is ignored and
   scoping follows the authenticated identity instead.
3. **Given** a newly written query against any records table, **When** it runs,
   **Then** household scoping is applied without the query's author having to
   remember to add it.

---

### Edge Cases

- **A figure exists in the spreadsheet that nothing computes.** Some cells are
  typed by hand and never derived. The reconciliation report must distinguish
  "computed and matches" from "carried across verbatim" so a hand-typed value is
  not mistaken for a verified calculation.
- **The spreadsheet contains an error.** Reconciliation proves agreement, not
  correctness. A discrepancy may mean the new logic is right and the spreadsheet
  has been quietly wrong. The report must make it possible to record that
  verdict rather than forcing the new system to reproduce a known bug.
- **Rounding.** The spreadsheet computes in floating point; the new store holds
  exact minor units. Small differences are expected on rate-converted lines,
  and only those — see FR-029/FR-030.
- **Two different "today"s.** Discovered during extraction: the spreadsheet's
  timezone is `America/Los_Angeles` while the application's is `Africa/Cairo`,
  ten hours apart. For roughly ten hours of every day the two disagree about
  the current date, so the spreadsheet's overdue counts and due-window totals
  are computed against a different day than the app's. A dump taken inside that
  window would make correct logic appear to fail reconciliation.
- **An account switched to derived mode with incomplete history.** If entries
  were never recorded for movements that did happen, the derived balance will
  be confidently wrong. Switching must surface this rather than silently
  producing a plausible number.
- **An asset with no recorded rate.** Computing a total when a rate is missing
  must fail visibly rather than treating the missing rate as zero, which would
  silently under-report net worth.
- **An empty or partial extraction.** If the dump is missing a tab or truncated,
  the import must refuse to run rather than importing a subset that would
  reconcile against nothing.
- **Re-running the import.** Running it twice must not duplicate records or
  produce a different result from running it once.
- **Non-Latin text.** Account and liability names may be Arabic. They must
  survive extraction, import, and reporting unchanged.
- **A correction against a correction.** Chains must resolve to the correct net
  and must not form a cycle.

## Requirements *(mandatory)*

### Functional Requirements

**Extraction and import**

- **FR-001**: System MUST import from the extracted spreadsheet dump, treating
  it as the authoritative record of current behaviour.
- **FR-002**: System MUST refuse to import an incomplete or truncated dump, and
  MUST state what was missing.
- **FR-003**: The import MUST be idempotent: running it more than once produces
  the same result as running it once, with no duplicated records. Idempotency
  MUST come from identifiers derived deterministically from each record's
  natural key, not from a post-hoc duplicate check — a randomly generated
  identifier cannot satisfy SC-006.
- **FR-004**: System MUST preserve non-Latin text exactly through extraction,
  import, and reporting.
- **FR-005a**: The import MUST be atomic: either every record lands or none
  does. A partially applied import is neither idempotent nor safe to reconcile
  against.
- **FR-044**: Every value the source records MUST be imported, including values
  no formula in the source reads. A value the source stores but never
  displays MUST NOT be discarded on the grounds that no figure depends on it.
- **FR-045**: Where an imported value is deliberately excluded from a computed
  figure, the exclusion MUST be expressed as an explicit rule over a modelled
  attribute, and the excluded value MUST be reported. It MUST NOT rest on the
  value failing to match a string comparison.
- **FR-046**: Monetary expected values used to verify the port MUST be taken
  from the source's stored values, never from its formatted display strings.
- **FR-047**: A monetary amount MUST be stored with the currency it is
  denominated in. No monetary column may assume a currency by convention.

**Fidelity**

- **FR-005**: System MUST reproduce every figure the spreadsheet computes,
  from base records, at read time.
- **FR-006**: System MUST produce a reconciliation report listing every such
  figure beside the newly computed figure with an explicit pass/fail verdict.
- **FR-007**: The reconciliation report MUST distinguish computed figures from
  values carried across verbatim.
- **FR-008**: Each ported calculation MUST have at least one test asserting
  against a real value from the extracted dump.
- **FR-009**: System MUST block completion of the migration while any
  reconciliation line fails.
- **FR-029**: Reconciliation MUST require **exact** agreement for any figure
  produced by summation, counting, or direct carry-over *(resolves Q2 —
  option C)*.
- **FR-030**: Reconciliation MAY permit a stated tolerance **only** for figures
  whose computation involves a rate conversion. The tolerance MUST be stated
  explicitly on the report, and every line that passes only by tolerance MUST
  be marked as such rather than shown as a plain pass.
- **FR-031**: A line that passes only by tolerance MUST record the size of the
  difference, so a systematic drift is visible even when each individual line
  is within bounds.
- **FR-010**: A discrepancy MUST be resolvable by recording which side was
  correct, and MUST NOT be resolvable by editing the expected value to match
  the computed one.

**Integrity**

- **FR-011**: System MUST store monetary amounts exactly, with no
  representation that can accumulate rounding error.
- **FR-012**: System MUST NOT persist any value it can derive from base
  records. Dated snapshots created by explicit user action are historical
  facts, not derived values, and are exempt.
- **FR-032**: Historical snapshots MUST be imported exactly as recorded and
  MUST NOT be recomputed under current logic *(resolves Q3 — option A)*.
- **FR-033**: Snapshots MUST be excluded from reconciliation pass/fail and
  listed separately as carried-over historical fact, since they were computed
  under rates and logic that no longer apply.
- **FR-013**: System MUST record every change to stored data with actor,
  timestamp, action, and before/after state.
- **FR-014**: System MUST apply changes atomically: a failure part-way leaves
  the data exactly as it was.
- **FR-015**: System MUST support corrections as new entries that reference
  what they correct, and MUST NOT permit in-place edits or deletion of
  historical records.
- **FR-016**: Derived totals MUST reflect the net effect of an entry and its
  corrections.

**Account balances** *(resolves Q1 — option C)*

- **FR-024**: Each account MUST declare how its balance is established: either
  **stated** (a value the owner sets directly, as the spreadsheet does today) or
  **derived** (computed from recorded entries). The two modes MUST coexist in
  the same household at the same time.
- **FR-025**: Every account MUST import in stated mode, preserving the
  spreadsheet's current behaviour exactly. No account changes mode as a side
  effect of migration.
- **FR-026**: An account in derived mode MUST have an opening balance and the
  date it applies from; its balance is that opening balance plus the net of all
  entries since.
- **FR-027**: Switching an account from stated to derived MUST be an explicit,
  recorded action, MUST require an opening balance and date, and MUST NOT alter
  any figure dated before the switch.
- **FR-028**: The system MUST make an account's mode visible wherever its
  balance is reported, so a stated balance is never mistaken for a proven one.

**Net worth presentation** *(resolves D4)*

- **FR-036**: System MUST expose both net-worth figures as distinctly named
  values — one excluding future installment obligations, one including them.
- **FR-037**: Neither figure may be presented as an unqualified "net worth".
  Any figure that omits committed future obligations MUST say so where it is
  shown.

**Rates** *(resolves D5)*

- **FR-038**: A rate MUST be stored as a dated record. Recording a new rate
  MUST create a new record and MUST NOT modify an existing one.
- **FR-039**: A rate recorded by an automated fetch MUST be written through the
  same path as a manual entry and MUST be attributable as an automated actor
  (`source = 'fetch'`). **This feature delivers the path, not the scheduler.**
  The write path, the `fetch` source value and its attribution are in scope and
  are tested by writing a rate as the automated actor. The scheduled trigger
  that calls it is a deployed artifact and is deferred to the feature that
  first deploys a Worker — see *Deferred* below. Until then rates are recorded
  with `source = 'manual'` or `'imported'`, which FR-038 and FR-041 already
  make correct and reproducible; nothing downstream depends on the fetch being
  automatic.
- **FR-040**: A failed or skipped fetch MUST NOT silently reuse the previous
  rate as though it were current. The age of the rate in use MUST be
  determinable wherever a converted figure is shown.
- **FR-041**: No stored rate may be a live external lookup evaluated at read
  time. Reading the same figure twice without an intervening write MUST return
  the same answer.

**Currency conversion** *(resolves D6)*

- **FR-042**: A transaction's converted amount MUST use the rate in force on
  the transaction's own date, and MUST NOT be restated when later rates are
  recorded.
- **FR-043**: If no rate exists on or before a transaction's date, conversion
  MUST fail visibly rather than substituting the nearest available rate.
- **FR-049**: The difference between a frozen historical conversion and the
  spreadsheet's live-rate conversion MUST be reported as a known, accepted
  divergence rather than a reconciliation failure — the spreadsheet's behaviour
  is the defect being corrected. Where the two produce the same number today,
  it is reported as a behavioural divergence and MUST NOT print a `DIVERGED`
  line (see contracts/reconciliation.md).

**Time**

- **FR-034**: The system MUST have exactly one canonical timezone for
  determining the current date, and every date-dependent calculation — overdue
  status, due windows, date stamps applied on write — MUST use it.
- **FR-035**: A date-dependent figure MUST NOT depend on the timezone of the
  device requesting it.
- **FR-048**: Before importing or reconciling, the system MUST verify that the
  dump's recorded timezone and its extraction timestamp place the extraction on
  the same calendar date under both the source timezone and the canonical
  household timezone. If they disagree, it MUST refuse to proceed and say so.
  Every `TODAY()`-dependent figure in the dump is otherwise unverifiable.

**Rate history**

*The general form of the rate rules. FR-038 and FR-041 state how a rate is
stored; FR-042 and FR-043 state how a transaction in particular is converted.*

- **FR-017**: System MUST retain every recorded rate with the date from which
  it applies, rather than only the latest. *(General form of FR-038.)*
- **FR-018**: System MUST compute a value as of a given date using the rate in
  force on that date. *(General form of FR-042.)*
- **FR-019**: A missing rate MUST raise a typed, distinguishable failure that
  names the asset class and the date requested. The caller MUST surface it
  rather than substituting a default, a zero, or the nearest available rate.
  "Report explicitly" means the failure reaches the reader — it does not permit
  returning a placeholder figure. *(General form of FR-043.)*

**Isolation**

- **FR-020**: Every record MUST belong to exactly one household.
- **FR-021**: Household scoping MUST derive from the authenticated identity and
  MUST NOT be taken from any caller-supplied input.
- **FR-022**: Scoping MUST be enforced structurally, such that a query written
  without it cannot reach records.
- **FR-023**: System MUST support multiple people in one household with
  distinct roles, and MUST record which person made each change.

### Key Entities

- **Household** — the unit of ownership and isolation. Every record belongs to
  exactly one. Holds shared settings such as the reporting currency.
- **Person** — someone who can sign in. Belongs to one or more households,
  with a role in each. Identified as the actor on every recorded change.
- **Membership** — a person's place in one household, carrying their role
  (`owner`, `admin`, `member`, `viewer`). At least one owner per household.
- **Invitation** — an outstanding offer of membership to an email address, with
  a role and an expiry. Never grants `owner`.
- **Account** — a holding of value: cash in a currency, or a quantity of a
  metal. Carries its asset class, whether it counts as an investment, its
  quantity, and **how that quantity is established** — stated directly by the
  owner, or derived from recorded entries against an opening balance. Accounts
  in both modes coexist.
- **Property holding** — a property position valued separately from accounts,
  carrying the amount paid to date.
- **Income settings** — the household's recorded salary, **the currency it is
  denominated in**, and the pay day. The source records a salary of 2,250 in
  **USD**; an EGP-only reading of it is a 200× error (FR-047).
- **Transaction** — a dated financial movement: income, expense, or transfer.
  Carries amount, its currency, category, description, and optionally a
  reference to the transaction it corrects. Called an "entry" in the user
  stories above; the two words name the same thing, and `transaction` is the
  term the schema and tests use.
- **Installment** — a dated future obligation with an amount, a plan it belongs
  to, and whether it has been settled.
- **Liability** — an amount owed, distinguished from an account holding value.
- **Rate** — an exchange or valuation rate for an asset class, with the date
  from which it applies. Retained historically.
- **Card** — a credit facility with its own cycle, and the payment obligations
  arising from it.
- **Snapshot** — a dated record of a computed position, created deliberately.
  A historical fact, not a cache.
- **Change record** — an append-only account of every mutation: who, when,
  what, and the state before and after.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the figures the spreadsheet computes appear on the
  reconciliation report with a pass verdict, or with a recorded and accepted
  explanation for the difference.
- **SC-008**: 100% of summed, counted and carried-over figures match exactly.
  Any figure passing only by tolerance is a rate-converted one, is marked as
  such, and shows the size of its difference.
- **SC-009**: The same date-dependent figure returns the same answer regardless
  of the timezone of the device requesting it, at every hour of the day.
- **SC-002**: 100% of ported calculations have at least one test asserting
  against a real extracted value.
- **SC-003**: An attempt to read another household's records fails in 100% of
  attempts, including when that household's identifier is supplied directly as
  input.
- **SC-004**: 100% of changes to stored data are attributable to a specific
  person at a specific time.
- **SC-005**: Every rate the owner has recorded remains retrievable after later
  rates are recorded; no rate is lost by being superseded.
- **SC-006**: Re-running the import produces a byte-identical result to the
  first run.
- **SC-007**: The owner can state, without consulting anyone, whether the
  migration is safe to complete, by reading the reconciliation report alone.

## Assumptions

- The spreadsheet remains available for the duration of this feature.
  Reconciliation is only possible while it is there to compare against, and any
  edit to it invalidates a dump taken beforehand.
- The spreadsheet's timezone was **not** corrected before extraction — the
  committed dump still records `America/Los_Angeles`. The dump happens to be
  safe (taken 13:06 Cairo / 03:06 LA, both 2026-08-27), but that is a property
  of when it was taken, not of the process. FR-048's preflight is what makes
  the safety checked rather than assumed, and any re-extraction must pass it.
- The extraction covers every tab that contributes to a computed figure. If a
  contributing tab is discovered later, the dump must be retaken.
- Historical spreadsheet data is accepted as-is. This feature does not attempt
  to detect or repair pre-existing errors in the owner's records — only to
  avoid introducing new ones. Errors found during reconciliation are surfaced,
  not silently fixed.
- The volume of data is small: hundreds of accounts and installments, at most a
  few thousand entries. No requirement is driven by scale.
- No user interface is delivered. Verification for this feature happens through
  the reconciliation report and the test suite, not a screen.
- The existing spreadsheet application keeps running untouched throughout, and
  the owner keeps using it. Cutover belongs to a later feature.
- Authentication is assumed to exist by the time isolation is exercised in
  production, but building it is out of scope here. This feature must design
  for it without depending on it.
- No git hook cuts branches in this project, so `003-data-foundation` was
  created by hand from `fix/code-review-findings` once the post-review
  corrections landed. Implementation work belongs on it.

## Resolved Decisions

All three were resolved by the owner on 2026-08-27.

### Q1 — Account balances → **stated now, derived later, per account**

Every account imports in stated mode, exactly as the spreadsheet behaves today,
so the migration changes no number and demands no change in habit. Derived mode
exists from the start and can be switched on one account at a time, each with
its own opening balance and date.

**Why not purely stated**: the transaction log would stay decorative — nothing
would ever have to reconcile against it, so errors in it would be undetectable.
**Why not purely derived**: it would require every movement to have been
recorded from day one, which is a change in daily habit imposed by a migration
rather than chosen. Per-account switching makes it an opt-in the owner controls.

Covered by FR-024 through FR-028.

### Q2 — Reconciliation tolerance → **exact for sums, tolerance only for conversions**

Summed, counted and carried-over figures must match to the minor unit. Only
figures involving a rate conversion may pass within a stated tolerance, and
such a pass is marked distinctly and records the size of its difference.

**Why**: this places the tolerance exactly where the error actually originates.
A blanket tolerance would mask a genuine off-by-small error in a sum; demanding
exactness everywhere would generate false failures from float noise the
spreadsheet cannot avoid. Recording the difference size means a systematic
drift stays visible even when every individual line is in bounds.

Covered by FR-029 through FR-031.

### D4 — Net worth → **both figures, named distinctly**

The spreadsheet computes two: 389,774 excluding future property installments,
and −7,824,831 including them. Only the first is displayed anywhere, so the
headline figure silently omits 8,214,605 of committed obligation. Both are
exposed, both are named, neither is "net worth" unqualified. FR-036, FR-037.

### D5 — USD rate → **scheduled fetch writing a dated record**

The rate is currently a live external lookup evaluated on every recalculation,
so every downstream figure moves without any user action and no figure is
reproducible. Replaced by a scheduled fetch that writes a dated rate record
through the same path as a manual entry. Convenience retained, history and
reproducibility gained. FR-038 through FR-041.

**Split across features.** The defect being corrected is *the live lookup*, and
killing that is entirely within this feature: once rates are dated records,
`Rates!B2`'s recalculation-drift is gone and every figure is reproducible. The
*scheduling* is a separate concern that needs a deployment target this feature
does not build. Shipping the record model now and the trigger later leaves no
intermediate state that is wrong — only one that is manual. Reversing the order
would be impossible, since there is nothing for a scheduler to write into.

### D6 — Historical conversion → **frozen at the transaction date**

A USD transaction is converted once, at the rate in force when it happened, and
never restated. The spreadsheet restates every past transaction whenever the
market moves. With exactly one transaction in the system, correcting this now
costs nothing and will never be cheaper. The resulting difference from the
spreadsheet is an accepted divergence, not a failure. FR-042, FR-043 and FR-049.

### D7 — Liability-account balances → **imported, and reported as unreachable**

Discovered while verifying the plan against the dump, after the first draft of
this spec.

The `Data` tab's class dropdown permits `Liability` alongside the four asset
classes, and two rows use it: `ADIB C.C` at **600 EGP** and `HSBC C.C` at 0.
No formula on any tab reads them. Every total is a `SUMIFS` matching a literal
asset-class string — `Total!J2` is
`SUMIFS(Data!D:D, Data!B:B, "EGP", Data!C:C, FALSE())` — so a row classed
`Liability` matches nothing and vanishes from every figure in the workbook.

The 600 EGP is therefore **recorded but invisible**: the owner typed it into
the sheet, and no number the sheet displays reflects it. It is not double-
counted either — the short-term liabilities list at `Total!I4:J10` carries
`CC ADIB` and `CC HSBC` at 0, separately from these rows.

**Decision**: import both rows faithfully as accounts of kind `liability`, keep
them out of asset totals *deliberately* rather than by string-match accident,
and have the reconciliation report state the unreachable balance explicitly.

This is **not** registered as a divergence, because no computed figure changes:
the sheet excludes these rows and so do we, so every total still reconciles
exactly. What changes is that the balance stops being silently lost. Whether
600 EGP is a real outstanding card balance that should join the short-term
liabilities list is a question about the owner's data, not about the port, and
this feature must not answer it by guessing. FR-044, FR-045.

### Q3 — Historical snapshots → **imported verbatim**

Snapshots are imported exactly as recorded, never recomputed, and are listed
separately from the reconciliation pass/fail set.

**Why**: a snapshot records what was believed true on a date, under rates and
logic that no longer apply. Recomputing it would rewrite history, and for some
dates the rates required no longer exist. It is a historical fact, not a cached
calculation — which is why FR-012 exempts it from the derive-don't-store rule.

Covered by FR-032 and FR-033.

## Deferred

Deliberately out of scope for this feature, recorded so the boundary is a
decision rather than an omission.

| Deferred | Why | Where it lands |
|---|---|---|
| The **scheduled** rate fetch (FR-039) | Needs a deployed Worker and a Cron trigger; this feature ships no deployment. The write path, the `fetch` source and its attribution are delivered and tested here — only the trigger is deferred. | The first feature that deploys a Worker |
| Reconciling the three spellings of the two credit cards — `Data!A13:A14`, `CC Payments!H7:H8`, `Total!I4:I5` | Merging them requires knowing which represents the real balance. That is a question about the owner's data, and guessing moves money. | An owner decision, surfaced by the D7 report line |
| `cards.limit_minor`, `statement_day`, `due_day` | The source records no value. Inventing one would store a fabricated fact. | Whenever the owner supplies them |
| The including-installments figure for the single imported snapshot | Never recorded historically and not recoverable from the dump. | Not recoverable; app-created snapshots record both from cutover on |

## Discovered During Extraction

Findings from `dumpSummary()` on 2026-08-27 that shape this feature.

- **The spreadsheet holds 707 formulas across 10 tabs, and 619 of them — 88% —
  are in `Transactions`.** That tab spans columns A through N, while the
  existing data model documents only A through H. Six computed columns are
  undocumented and constitute the bulk of the model to be recovered.
- **Two conflicting timezones** (see Edge Cases and FR-034/FR-035). The
  extraction must be taken with both agreeing on the date, or the resulting
  dump will misrepresent every `TODAY()`-dependent figure.
- **The spreadsheet's yellow-cell convention does not describe the write
  surface.** `Transactions` and `Installments` report zero yellow input cells,
  yet the application appends rows to one and sets the paid column on the
  other. Yellow marks what a person may type, not what the application may
  write. Any inference of writability from formatting alone is incomplete.
- **Formatting extends past real data.** `Data` reports 199 input cells across
  rows to 200, which reflects how far the formatting was applied rather than
  how many accounts exist. Record counts must come from content, not format.
- **Volumes are small**, and smaller than assumed when this spec was drafted:
  17 accounts, 56 installments, **1 transaction**, **1 stored snapshot**, and
  no credit-card payment rows. Nothing here is driven by scale, and the cost of
  correcting a modelling flaw now is close to zero.
- **`History` row 2 is not a snapshot.** It is a live formula mirror of the
  net-worth figures, with a literal `SNAPSHOTS ↓` separator beneath it. It MUST
  be excluded from import: storing it would persist a derived value and violate
  FR-012.
- **The `Data` tab has a fifth class, `Liability`, and two rows use it.** The
  dropdown permits it alongside the four asset classes. `ADIB C.C` holds 600
  EGP and no formula in the workbook reads it — every total is a `SUMIFS` on a
  literal asset-class string, so these rows match nothing anywhere. The balance
  is recorded and invisible (D7).
- **`CC Payments` is not the empty tab it appears to be.** Its payment rows are
  blank, but a settings block to the right holds the salary amount (2250), the
  salary currency (**USD**), the pay day (27) and four named cards. Reading
  only columns A–F would silently discard all of it.
- **Ten of the 56 installments carry fractional EGP amounts** (14,752.80 and
  29,505.60), so every installment summary lands on a non-zero piastre.
  Expected values taken from the sheet's *displayed* figures are wrong by tens
  of piastres, and the error is invisible at EGP resolution.
- **The one transaction is stamped `2026-08-24T21:00:00.000Z`** — 24 August in
  Los Angeles, 25 August in Cairo. The timezone conflict is not hypothetical;
  it already straddles the workbook's only transaction.
- **Reconciliation must pin the USD rate** to the value captured in the dump
  (50.2554). The spreadsheet's rate is a live market lookup, so every figure
  downstream of it changes between recalculations; unpinned, golden tests fail
  for reasons unrelated to the code.
