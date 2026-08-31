# Feature Specification: Multi-User Application

**Feature Branch**: `004-multi-user-app`

**Created**: 2026-08-27

**Status**: Draft

**Input**: User description: "Create the specification for Feature 004 — the Next.js application: a multi-user financial application built on the Feature 003 data foundation, covering authentication, session-bound identity, household data isolation, user-managed credit cards, the ADIB/HSBC card consolidation with the recorded 600 EGP correction, and an explicit deferral of all UI/visual design to owner-supplied Claude Design output."

## Overview

Feature 003 delivered a verified, reconciled data foundation: a tenancy-scoped schema, read-only repositories, an append-only audit log, atomic write primitives, a corrections mechanism, and pure financial derivations — all proven against the source spreadsheet by a machine-checked reconciliation gate. It deliberately shipped no authentication, no application, and almost no write paths.

Feature 004 turns that foundation into a real multi-user application service. It supplies the missing pieces the foundation was designed to receive: a genuine authenticated identity behind the existing identity abstraction, strict per-household data isolation, the first user-facing write capability (credit card management), and the first recorded financial correction (the ADIB card consolidation at 600 EGP). It does **not** redesign anything Feature 003 verified, and it does **not** design any user interface — visual design is deferred to owner-supplied designs (see *UI / Design Constraint*, which is binding on all downstream planning and implementation).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in and reach only your own household (Priority: P1)

A person signs in with their Google account. If they are new, the system provisions a personal household for them and makes them its owner. From that moment, every piece of financial data they can see or change belongs to a household they are a member of — and nothing else. A caller can never designate whose data to operate on: the acting identity comes only from the verified session. Signing out ends access.

**Why this priority**: Nothing else in the application is safe to build without this. The current data layer trusts a caller-supplied user identifier; in a multi-user deployment that is an open door. Authentication, session handling, and structural isolation are the precondition for every other story.

**Independent Test**: Can be fully tested by creating two users with separate Google accounts, seeding distinct data into each of their households, and verifying that every read and write by one user touches only their own household — including attempts that explicitly name the other household's or user's identifiers, all of which must be refused or answer as if the data does not exist.

**Acceptance Scenarios**:

1. **Given** a person with a Google account who has never used the application, **When** they sign in for the first time, **Then** they are authenticated, a household is provisioned with them as its owner, and the provisioning is recorded in the audit log.
2. **Given** an authenticated user, **When** they request any financial data, **Then** the results are drawn exclusively from households they are a member of, and the household scope is derived from their session — never from anything the request supplies.
3. **Given** an authenticated user who submits a request naming another household's identifier (in a path, parameter, body field, or header), **When** the request is processed, **Then** it is answered exactly as if that household did not exist, and no data from it is disclosed.
4. **Given** an unauthenticated caller, **When** they attempt to reach any financial data or perform any operation, **Then** the request is refused and no data is disclosed.
5. **Given** an authenticated user whose session has expired or been ended, **When** they make a further request, **Then** it is treated as unauthenticated.

---

### User Story 2 - The owner claims the migrated household (Priority: P2)

The person whose spreadsheet was migrated in Feature 003 signs in with their real Google account and finds their migrated financial data — accounts, installments, transactions, rates, snapshots, and the imported cards — already there, owned by them. The placeholder identity the importer synthesized is retired: it can never sign in and no longer represents the household's owner. The imported ADIB and HSBC cards are theirs to manage like any other card; they are seed data for this one household, not fixtures of the application.

**Why this priority**: The application exists first for the household that was migrated. Until the imported household is bound to a real authenticated account, the migration's beneficiary cannot use the product, and the synthetic placeholder identity is a loose end in a system that now has real authentication.

**Independent Test**: Can be fully tested by designating an owner account, signing in with it, and verifying the session lands in the migrated household with all imported records readable through the standard scoped access paths; then verifying the placeholder identity cannot authenticate and holds no active ownership, and that the claim event is audited.

**Acceptance Scenarios**:

1. **Given** the deployment operator has designated the real owner account for the migrated household, **When** that person signs in for the first time, **Then** their session is bound to the migrated household as its owner (no empty duplicate household is provisioned for them), and the binding is recorded in the audit log.
2. **Given** the owner has claimed the migrated household, **When** they read their financial data, **Then** all imported records are present and identical to what Feature 003 imported — the claim changes ownership, not financial history.
3. **Given** the claim has completed, **When** anyone attempts to authenticate as, or act as, the synthetic placeholder identity, **Then** no such access path exists.
4. **Given** a different (non-designated) new user signs in, **When** their account is provisioned, **Then** they receive their own fresh household and gain no access of any kind to the migrated household.

---

### User Story 3 - Manage your own credit cards (Priority: P3)

A user views the credit cards in their household, creates new cards, and updates existing ones — naming the card and, when they choose to, recording its credit limit, statement day, and due day. Cards belong to the user's household; no card, name, limit, or schedule is built into the application itself. Every change is validated, attributed to the user who made it, and recorded in the audit log with the state before and after.

**Why this priority**: This is the first user-facing write capability, and the one the foundation most visibly lacks — Feature 003 shipped card storage and card reads but deliberately no card write path. It also establishes the pattern every later write capability will follow: validated input, session-derived scope, atomic write plus audit record.

**Independent Test**: Can be fully tested by one user creating and updating cards and confirming the changes, the validation refusals, and the audit records; and by a second user confirming they can neither see nor modify the first user's cards.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they create a card with a valid name, **Then** the card exists in their household, optional fields they did not supply remain unset (never invented), and an audit record captures the creation and the acting user.
2. **Given** an existing card in the user's household, **When** the user updates its name, credit limit, statement day, or due day with valid values, **Then** the change is applied and an audit record captures the before and after state and the acting user.
3. **Given** an authenticated user, **When** they view their cards, **Then** they see exactly the cards of their own household — including, for the migrated household, the imported seed cards — and no others.
4. **Given** a card creation or update with an invalid value (empty name, a duplicate name within the household, a negative credit limit, a statement or due day outside 1–31, or a non-integer monetary amount), **When** it is submitted, **Then** it is refused with a clear reason and nothing is written.
5. **Given** a user attempts to update a card that belongs to another household, **When** the request is processed, **Then** it is answered exactly as if the card did not exist.
6. **Given** a household member whose role is read-only (viewer), **When** they attempt to create or update a card, **Then** the request is refused as unauthorized and audited data is unchanged.

---

### User Story 4 - One ADIB card, 600 EGP, no double-counting (Priority: P4)

After the owner claims the migrated household, the three historical spreadsheet labels `ADIB C.C`, `ADIB CC`, and `CC ADIB` are consolidated into a single ADIB card entity carrying the correct balance of 600 EGP, and the incorrectly entered 0 EGP duplicate stops being counted as a separate liability. Likewise `HSBC CC`, `HSBC C.C`, and `CC HSBC` consolidate into a single HSBC card (with no balance change, since every HSBC source value is zero). The consolidation is applied as a recorded, audited financial correction — linked to what it corrects — never as an in-place edit or deletion of imported history, and never as a change to Feature 003's reconciliation evidence.

**Why this priority**: This executes the already-final D7 decision from the Feature 003 decision register. It matters for financial correctness — today the migrated figures understate short-term liabilities by 600 EGP and overstate both net-worth figures by 600 EGP — but it depends on Stories 1–3 (an authenticated owner, a claimed household, and a card entity to consolidate onto), so it lands last.

**Independent Test**: Can be fully tested on the claimed migrated household by applying the consolidation and verifying: exactly one ADIB card entity and one HSBC card entity remain in the household's current view; the ADIB balance contributes exactly 600 EGP to short-term liabilities, exactly once; derived short-term liabilities are exactly 600 EGP higher, and both net-worth figures exactly 600 EGP lower, than the archived spreadsheet's figures; every imported row is still present unmodified; the correction entries and their audit records exist and reference what they correct; and Feature 003's reconciliation artifacts and evidence are byte-for-byte unchanged.

**Acceptance Scenarios**:

1. **Given** the claimed migrated household, **When** the ADIB consolidation is applied, **Then** the household's current financial view contains one ADIB card entity whose balance is 600 EGP, and no separate ADIB entry contributes any additional amount.
2. **Given** the consolidation is applied, **When** derived figures are computed, **Then** the 600 EGP is counted exactly once in short-term liabilities, short-term liabilities are 600 EGP higher than the archived sheet's figure, and both net-worth figures are 600 EGP lower — and no other figure changes.
3. **Given** the consolidation is applied, **When** the imported records are inspected, **Then** every imported row remains present and unmodified; the consolidation exists only as new correction entries linked to the entries they correct, each with an audit record naming the acting identity and citing the D7 decision.
4. **Given** the consolidation is applied, **When** Feature 003's reconciliation report and golden evidence are regenerated against the imported state, **Then** they still pass unchanged — the correction is an application-era event, not a rewrite of migration parity.
5. **Given** the HSBC consolidation is applied, **When** derived figures are computed, **Then** exactly one HSBC card entity remains and no derived figure changes.
6. **Given** a consolidation has already been applied, **When** it is attempted again, **Then** the system refuses to double-apply it; the correction cannot be recorded twice.

---

### Edge Cases

- A session expires between the user loading their data and submitting a write: the write is refused as unauthenticated and nothing is recorded.
- The same person's Google account changes its display name or picture: identity continuity is by the account's stable identifier, and profile changes never create a second user or a second household.
- The designated owner account signs in *before* the claim mechanism is configured: they must not silently receive an empty duplicate household that later competes with the migrated one — the outcome must be explicit and recoverable.
- Two members of the same household update the same card at nearly the same time: both updates are applied atomically with their audit records; the final state reflects one of them and the audit log reflects both.
- A card's statement day or due day is 29–31 in a shorter month: the day is interpreted by clamping to the month's last day, consistent with the foundation's existing date conventions.
- A user attempts to supply their own user identifier or household identifier anywhere in a request: the supplied value is never used for scoping; only the session's identity counts.
- A user is a member of more than one household (possible in the data model even though membership management is deferred): every operation acts on exactly one unambiguous household context, never a merged view.
- An authenticated user whose account exists but whose household membership row is missing or corrupted: the failure is safe (no data disclosed, no partial writes) and diagnosable.
- The consolidation correction is attempted by a non-owner member: it is refused as unauthorized (financial corrections are owner/admin actions).
- A write succeeds but its audit record cannot be written: this must be impossible — the write and its audit record commit together or not at all.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & sessions**

- **FR-001**: The system MUST authenticate users via their Google account through the sign-in mechanism mandated by the project constitution; no password or credential is ever stored by the application.
- **FR-002**: The system MUST maintain server-side sessions such that every request is attributable to exactly one authenticated user or is anonymous; session records persist in the application's own database under the owner's control.
- **FR-003**: The system MUST allow a user to sign out, after which their session grants no further access.
- **FR-004**: Sessions MUST expire after a bounded lifetime, and an expired or revoked session MUST be indistinguishable from no session.
- **FR-005**: On a user's first sign-in the system MUST create their user record, and — unless they are the designated owner of the migrated household (FR-011) — provision a new household with that user as its sole owner member, recording the provisioning in the audit log.

**Identity binding & data isolation**

- **FR-006**: The data layer's identity (the existing `Identity` abstraction) MUST be produced exclusively from the verified session. No request-supplied value — path segment, query parameter, body field, or header — may ever select or influence the acting user identity or household scope. (Constitution Principle IX.)
- **FR-007**: Every data operation MUST execute within a household context established by verifying the session user's membership in that household; a user with no membership in a household MUST receive responses indistinguishable from that household not existing.
- **FR-008**: All access to user-owned financial data MUST be authorized against the acting member's role in the household: read access requires membership; write access requires a writing role (viewer is read-only); financial corrections require the owner or an admin.
- **FR-009**: Cross-household access MUST be structurally impossible through the application's data-access layer — scoping is applied inside that layer, not in individual request handlers — preserving the foundation's existing enforcement (scoped repositories, composite ownership keys, and the isolation test suite), which MUST remain intact and passing.
- **FR-010**: The system MUST provide authenticated read access to a household's complete current financial state — accounts, property, liabilities, installments, transactions, rates, snapshots, cards, and all derived figures — through the foundation's existing aggregated read, satisfying the constitution's one-aggregated-read requirement without persisting any derived value.

**Claiming the migrated household**

- **FR-011**: The system MUST provide an explicit, operator-designated, one-time mechanism that binds the migrated household (created by the Feature 003 import) to the owner's real authenticated account, recording the binding in the audit log. After the claim, the synthetic placeholder identity created by the importer MUST hold no ownership and MUST NOT be an authentication target; historical attributions to it (imported rows, import audit entries) remain unchanged as historical fact.
- **FR-012**: The claim MUST NOT modify any imported financial record; it changes ownership and access only.
- **FR-013**: The imported cards, accounts, and liabilities MUST behave as ordinary user-owned data of the migrated household — the application MUST NOT treat any specific card, name, balance, limit, or schedule as built-in, hard-coded, or globally predefined.

**Card management**

- **FR-014**: Users with a writing role MUST be able to create a card in their household, supplying a name and optionally a credit limit, statement day, and due day; fields the user does not supply remain unset — the system never invents a value.
- **FR-015**: Users with a writing role MUST be able to update an existing card's name, credit limit, statement day, and due day, including setting a previously unset field and clearing an optional field.
- **FR-016**: Users MUST be able to view all cards in their household, including seed cards imported by Feature 003, with their current attributes.
- **FR-017**: Card input MUST be validated before any write: the name is required, non-empty after trimming, and unique within the household (case-insensitive); the credit limit, when supplied, is a non-negative amount in integer minor units; the statement day and due day, when supplied, are integers from 1 to 31, interpreted in shorter months by clamping to the month's last day. Invalid input is refused with a stated reason and writes nothing.
- **FR-018**: Every card creation and update MUST be written atomically together with an audit record capturing the acting user, the action, and the before and after state; the write and its audit record cannot be separated.
- **FR-019**: Card write operations MUST be delivered as extensions of the foundation's existing data-access layer and write discipline (typed access, statement-batch atomicity, scoped context) — not as a parallel data-access path.

**ADIB / HSBC consolidation and the 600 EGP correction**

- **FR-020**: The system MUST resolve the three historical ADIB labels (`ADIB C.C`, `ADIB CC`, `CC ADIB`) to a single ADIB card entity in the migrated household, and the three historical HSBC labels (`HSBC CC`, `HSBC C.C`, `CC HSBC`) to a single HSBC card entity, per the final D7 decision in the Feature 003 decision register. This decision is settled input to this feature, not a question it reopens.
- **FR-021**: After consolidation, the migrated household's current financial view MUST present the ADIB balance as exactly 600 EGP, contributed exactly once to short-term liabilities; the incorrectly entered 0 EGP duplicate MUST NOT be counted as a separate liability. Relative to the archived spreadsheet, derived short-term liabilities are exactly 600 EGP higher and both net-worth figures exactly 600 EGP lower; no other derived figure changes. The HSBC consolidation changes no derived figure.
- **FR-022**: The consolidation MUST be recorded as explicit correction entries linked to the entries they correct, following the foundation's established correction discipline: imported rows are never edited in place and never deleted; each correction carries an audit record naming the acting identity and referencing the D7 decision.
- **FR-023**: The consolidation MUST be impossible to apply twice: a repeated attempt is refused and records nothing.
- **FR-024**: The consolidation MUST NOT alter Feature 003's reconciliation artifacts, golden evidence, decision register, or any imported row. The parity proof reconciles the imported state against the archived spreadsheet and remains reproducible unchanged; the correction is an application-era financial event layered on top.
- **FR-025**: The historical labels MUST remain discoverable after consolidation (through preserved imported rows and audit records) so the trail from three spreadsheet names to one card is auditable.

**Audit & integrity (applies to every write in this feature)**

- **FR-026**: Every mutation introduced by this feature MUST execute atomically together with its append-only audit record (actor, action, entity, before and after state), using the foundation's existing atomic-write and audit primitives. Partial writes and unaudited writes are unrepresentable.
- **FR-027**: The system MUST generate unique identifiers and timestamps for application-created records in a way that is safe for concurrent use; the import-era content-derived identifiers are for imported rows only and MUST NOT be used for new application writes.
- **FR-028**: All monetary values introduced by this feature MUST be integer minor units end to end — storage, arithmetic, and transport — per the foundation's existing money discipline.

**Infrastructure**

- **FR-029**: The project MUST gain a continuous-integration workflow on its hosted repository that runs the existing verification suites (both database drivers), the type check, the monetary lint, and the reconciliation gate on every proposed change. No CI exists today — this is a gap this feature must close, not a facility it may assume. Its absence does not block writing or approving this specification.

### Key Entities

- **User**: A person authenticated via their Google account. Identified by a stable account identifier and email; carries only profile data (name, picture). Already modeled in the foundation; this feature makes the records real by binding them to authentication.
- **Session**: The server-side record binding a signed-in user to their requests for a bounded lifetime. New in this feature; the sole source of acting identity.
- **Household**: The unit of data ownership and isolation. Every financial record belongs to exactly one household. Already modeled; this feature adds provisioning on first sign-in and the one-time claim of the migrated household.
- **Membership**: Links a user to a household with a role (owner, admin, member, viewer). Already modeled; this feature is the first to enforce role semantics: viewer reads only, writing roles manage cards, owner/admin record corrections.
- **Card**: A credit card owned by a household: a required name plus optional credit limit, statement day, and due day. Already modeled with read access; this feature adds the create and update capability. No card is application-defined; the imported ADIB/HSBC/other cards are seed rows of the migrated household only.
- **Financial correction**: A new entry linked to the entry it corrects — never an in-place edit or deletion. Already modeled and mechanized; this feature records its first real instances: the ADIB consolidation at 600 EGP and the HSBC label consolidation.
- **Audit record**: The append-only trail of every mutation (actor, action, entity, before/after). Already modeled and mechanized; this feature extends it to authentication-era events (provisioning, claiming) and card writes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of requests for financial data or mutations without a valid session are refused with no data disclosed, across the entire application surface.
- **SC-002**: In adversarial testing where one user directs requests at another household's data — including by naming its identifiers explicitly — zero records from the other household are ever disclosed or modified, across 100% of attempted operations.
- **SC-003**: A new user goes from first sign-in to seeing their own (empty) household in under 1 minute with no manual intervention.
- **SC-004**: The designated owner, after claiming the migrated household, can read 100% of the records Feature 003 imported, unchanged.
- **SC-005**: A user can create a card and see it reflected in their household's data in under 1 minute; invalid card input is refused with a stated reason in 100% of the defined invalid cases.
- **SC-006**: 100% of mutations introduced by this feature have a corresponding audit record committed in the same atomic unit; no test or inspection can produce a mutation without one.
- **SC-007**: After the ADIB consolidation, the migrated household shows exactly one ADIB card entity at exactly 600 EGP; derived short-term liabilities exceed the archived spreadsheet's figure by exactly 600 EGP (in minor units, exactly — no tolerance) and both net-worth figures are exactly 600 EGP lower; every other derived figure is unchanged.
- **SC-008**: After both consolidations, 100% of imported rows remain byte-identical to their imported state, and Feature 003's reconciliation report and golden evidence regenerate unchanged and passing.
- **SC-009**: A repeated attempt to apply an already-applied consolidation results in zero new records, 100% of the time.
- **SC-010**: The foundation's existing verification suites (golden, unit, isolation, atomicity, on both database drivers) remain 100% passing throughout this feature.
- **SC-011**: A continuous-integration run executes the full verification set automatically on 100% of proposed changes to the hosted repository.

## UI / Design Constraint *(binding on planning and implementation)*

All visual and interaction design for this application is supplied by the owner using dedicated design tools (including Claude Design). This specification therefore deliberately contains **no** page layouts, screen compositions, dashboard designs, navigation designs, component styling, colors, or typography — and none may be introduced on its behalf downstream:

- `/speckit-plan` and `/speckit-tasks` MUST NOT prescribe page layouts, visual designs, component appearance, or screen compositions. They may plan backend/server capabilities, data contracts, validation, and authorization freely.
- When implementation reaches the point where a screen, page, or visual component would need to be designed or built, work MUST STOP at that boundary and the owner MUST be notified to supply designs. Implementing ahead of owner-supplied designs is out of bounds.
- Functional requirements in this specification describe *what users can do and what the system guarantees*, never *what anything looks like*. The constitution's visual-language and phone-first principles apply to the eventual owner-supplied designs, not to this specification.

## Relationship to Feature 003

Kept explicit so scope stays honest:

1. **Existing capabilities reused as-is (not rebuilt)**: the database schema (households, users, memberships, invitations, accounts, property, liabilities, transactions, installments, cards, card payments, income settings, rates, snapshots, audit log); the scoped repository layer and household-context constructors; the statement-batch atomic write primitive; the append-only audit mechanism; the corrections mechanism (linked reversing entries, cycle and double-reversal protection); the pure derivation layer and aggregated household state read; the money discipline (integer minor units, decimal rate arithmetic, half-up rounding); the reconciliation evidence and decision register; the golden/unit/isolation/atomicity test suites on both drivers.
2. **New in Feature 004**: authentication and sessions; production of the data-layer identity from the session; first-sign-in household provisioning; the one-time claim of the migrated household and retirement of the placeholder identity; role enforcement; card create/update (the missing card write path) with validation and audit; an application-grade identifier/timestamp source for new writes; the recorded ADIB 600 EGP consolidation and HSBC label consolidation; the CI workflow.
3. **Deferred** (see next section).
4. **Future UI/design work**: owner-supplied via Claude Design; binding constraint above.
5. **Infrastructure**: CI is a known gap (FR-029); deployment configuration, backups, and cutover remain governed by the constitution and are addressed when their features arrive.

## Deferred

Deliberately out of scope for Feature 004, recorded so the boundary is a decision rather than an omission:

| Deferred | Why |
|---|---|
| All remaining daily-action write paths (logging transactions, marking installments paid, editing account balances and liabilities, property paid-to-date, snapshots, card payments, income settings) | Feature 004 establishes the authenticated write pattern with card management; the remaining writes follow that proven pattern in subsequent features rather than inflating this one. |
| Household membership management (inviting members, accepting invitations, role changes, removal) | The invitation model is fully scaffolded in the foundation but the flow is its own feature; Feature 004 enforces roles for the operations it introduces. |
| Card archival/deletion | Not requested; needs its own decision on how a retired card's history is presented. |
| The scheduled rate fetch trigger | Carried forward from Feature 003's deferral; needs a deployed scheduled job. |
| Cutover from the running spreadsheet application, deployment configuration, and encrypted backups | Governed by the constitution; belong to the feature that deploys and cuts over. |
| Supplying real values for the imported cards' credit limits, statement days, and due days | Feature 004 delivers the capability (card update); entering the owner's actual values is the owner's data entry, not a requirement. |
| All UI construction | Blocked on owner-supplied designs (binding constraint above). |

## Assumptions

- **Scope of writes**: The user's request names card management as this feature's user-facing write capability. The other daily actions the legacy spreadsheet app supports are explicitly deferred (see *Deferred*) rather than silently included — Feature 004 is the identity, isolation, card, and correction feature, not the whole application in one bite.
- **Technology envelope**: The project constitution (v2.0.0) fixes the stack this application runs on (the web framework, edge host, database, ORM, and the Google-based sign-in). This specification states requirements independently of it; the constitution governs the *how* at planning time.
- **Claim designation**: The migrated household's rightful owner is designated by the deployment operator (who is the same person) through explicit configuration — the system never guesses ownership from data such as email similarity.
- **Role defaults**: Role semantics for this feature are: viewer = read-only; member and above = card writes; owner/admin = financial corrections; owner = claim. Finer-grained permissions are not needed for this feature's surface.
- **Card name uniqueness** is enforced per household, case-insensitively, as an application rule (the stored schema does not constrain it); the imported card names are already distinct within the migrated household.
- **Consolidation actor**: The ADIB/HSBC consolidation is performed by (or on behalf of, with attribution to) the household owner after the claim, as an owner-level financial correction citing D7 — not as an anonymous system migration.
- **Session lifetime** follows standard secure-web-application practice (bounded lifetime with renewal on activity); the exact durations are a planning-time choice.
- **Single-household experience**: Every user in this feature belongs to exactly one household in practice (provisioned or claimed); the data model's ability to hold multiple memberships is preserved but not exercised until membership management arrives.
- **No CI exists today**; the repository is hosted with a real remote, and FR-029 closes the gap without blocking this specification.

## Dependencies

- Feature 003 is complete and verified: its reconciliation gate passes against the committed spreadsheet dump, all its suites are green, and its decision register — including the final D7 resolution (one ADIB card, 600.00 EGP, the 0 EGP entry at `Total!J4` was entered incorrectly) — is authoritative input to this feature.
- The Feature 003 deferral list hands this feature: the card write path, the D7 application, and the expectation of a real authentication flow binding to the existing identity abstraction.
- The archived spreadsheet remains the frozen parity reference for the imported state only; the 600 EGP correction is deliberately a divergence *from* it, recorded as an application-era financial event with an audit trail.
