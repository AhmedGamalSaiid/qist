# Feature Specification: App Shell, Home, and Cards

**Feature Branch**: `005-shell-home-cards`

**Created**: 2026-09-03

**Status**: Draft — proposals P1–P6 approved by the product owner on 2026-09-03 (P1 amended); awaiting the Stage 1 design-review additions and the Home design sign-off before `/speckit-plan`

**Input**: User description: "Feature 005: app shell (header, bottom navigation, session sheet), Home, Cards list, Cards create/edit. Sign in is recorded as delivered on `004-multi-user-app` and is not re-specified here; 005 depends on it." Plus the twenty-eight clarification answers of 2026-09-03, folded into the matching requirements below.

## Overview

Feature 004 delivered the headless application: Google sign-in, sessions, household isolation, the one aggregated read (`GET /api/state`), card create/update, and the one-time ADIB/HSBC consolidation. Sign in — screen 1 of the screen map — was then built and is the delivered state of this project at merge `cfef855` (handoff commit `05436e0`; the written Arabic A4 copy landed at `7181ffb` and is included in the merge). Sign in is **not re-specified here**; Feature 005 depends on it and may touch it only where §F below says so.

Feature 005 is the first authenticated surface: the **app shell** (header, bottom navigation, session sheet), **Home** (the household's whole financial position in one screen), the **Cards list**, and **Cards create/edit** (the only write surface in the product). It is a **functional specification only**. It makes no visual decision; where a behaviour has a visual half, the spec records the functional constraint and names design as the owner of the rest.

The feature also makes fifteen **contract decisions** (R1–R15) that the 2026-09-02 payload audit established as undecided or broken. Each is a functional requirement here with acceptance criteria. Where the product owner stated a decision it is recorded; where the owner said "decide", one option is proposed with rationale and listed in §Proposals **for approval before planning**.

### Inputs, in order of authority when they conflict

1. `design/handoff/00-project-design-context-brief.md` — §2 screen map, §3 sign in, §4 Home, §5 localization.
2. `design/handoff/01-design-system-and-sign-in.md` — the Sign in handoff spec.
3. The payload-contract answers document of 2026-09-02 ("the answers document").
4. `specs/004-multi-user-app/` — spec, contracts, data model.
5. The constitution, v3.0.0, Principle VII in particular.

### Sequencing (binding)

- `/speckit-plan` may run once the **Home design is signed off**.
- **Implementation of any screen waits for that screen's signed-off handoff spec in `design/handoff/`.** Cards is designed after Home Stage 4; its list and create/edit screens are not implemented before their handoff spec lands.
- Nothing in this spec authorises building ahead of a signed-off design (004's binding UI constraint still applies).

### Decided by design — recorded, not reopened

The following placements were open in the brief and are now decided:

- **Sign-out, language switch, and the consolidation action all live in one session sheet**, opened from a **single header control**.
- **The bottom bar contains Home and Cards only.**
- **The `EGP` code trails the amount, inside one isolated LTR run, in both languages.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See the household's whole position on Home (Priority: P1)

A signed-in member opens the app and lands on Home. The screen paints from cache if there is one, then reconciles against a fresh read. Every section of the household's financial state is present: two distinctly named net-worth figures, headline totals, holdings by class with the age of the rate behind every converted figure, the installments summary and the 21 fixed year buckets, the 24-month rollup, accounts with their balance mode, cards, liabilities including superseded rows beside their corrections, property, transactions, snapshots, and card payments. A brand-new household shows all of this with every figure at zero and no section missing. A figure that was never recorded is never shown as zero; a figure that cannot be computed because a rate is missing is loudly marked, not quietly zeroed.

**Why this priority**: Home is the product. Everything else in 005 exists to reach it or to write into it. The empty household is the first thing most new users see and carries more weight than the populated one.

**Independent Test**: Sign in as the owner of the migrated household and as a fresh user with an empty household; verify every payload section renders in both, that the two net-worth figures carry distinct qualified names, that rate age is visible on every converted figure and reads "stale" for the 2026-08-17 rates, that `null` figures never render as `0`, and that the empty household's read succeeds and renders every section as an empty state.

**Acceptance Scenarios**:

1. **Given** a signed-in member with a valid session and no cache, **When** they open `/`, **Then** the page shows structure at real geometry while the single aggregated read is in flight, then the full state; at no point is the screen blank or a spinner.
2. **Given** a cached payload from a previous visit, **When** they open `/`, **Then** the cached state paints before any network request, a fresh read follows, and the screen ends in one of exactly three outcomes: no change; changes applied in place; or read failed with the cached content still showing and the failure shown as a page state.
3. **Given** a brand-new household with no accounts, cards, installments, transactions, rates, or snapshots, **When** the member opens Home, **Then** the read succeeds (never a 500), every derived figure is zero, `unpaidByYear` has 21 zero rows, `assetMix` has 5 zero rows, the rollup has 24 rows, every list section renders as an empty state, and no section disappears.
4. **Given** the migrated household on a day when its rates are more than 7 days old, **When** Home renders any converted figure, **Then** the figure carries its rate's age classified as stale, and no converted figure can be read as current.
5. **Given** the imported snapshot whose `netWorthInclInstallmentsMinor` is `null`, and a month whose `savingsRate` is `null`, and cards whose limit / statement day / due day are `null`, **When** Home renders them, **Then** each is presented as not recorded, and none is presented as `0`, `0.00`, or `0%`.
6. **Given** a household that holds a non-zero quantity in a class with no rate on or before `today`, **When** Home renders, **Then** every figure that depends on that class is marked uncomputable and names the class and the as-of gap; every figure that does not depend on it renders normally; the read does not fail.
7. **Given** the payload's `nextDueOn` is `null`, **When** the installment summary renders, **Then** it states there is no upcoming installment and `0.00` does not appear as the next amount due.
8. **Given** Home is rendered, **When** the member looks for the date the figures are computed against, **Then** the payload's Cairo `today` is stated once on the screen.

---

### User Story 2 — Move through the shell, in either language (Priority: P2)

The shell carries the Qist mark in the header, a single header control that opens the session sheet, and a bottom bar with exactly two destinations: Home and Cards. The session sheet shows the member's role as a word and offers sign-out, the language switch, and — for owner/admin on the one household where it applies — the consolidation action. Switching language re-renders every screen in place in the other language and direction without a re-fetch. The mark never mirrors. Sign-out ends the session, evicts every cached household figure, and returns to sign in in its signed-out state.

**Why this priority**: Without the shell there is no way to reach Cards, switch language, or sign out; without server-side locale the first paint of every screen is in the wrong language for Arabic users.

**Independent Test**: From Home, open the session sheet as each of the four roles and verify the role word and the exact set of actions; switch language and verify `<html lang dir>` flips, every UI string changes, household data does not, and no network request is made; sign out and verify the 401-on-next-request, the cache eviction, and arrival at `/sign-in?signed-out`; navigate Home ⇄ Cards from any scroll depth via the bottom bar in both directions.

**Acceptance Scenarios**:

1. **Given** the `qist-locale` cookie is `ar`, **When** any shell page is requested, **Then** the server's first paint already carries `lang="ar" dir="rtl"` on the root document; there is no flash of English.
2. **Given** a member on any screen, **When** they use the language switch, **Then** the cookie is written, the root `lang`/`dir` and every UI string change in place, no read is issued, and every household name, figure, and date is byte-identical before and after.
3. **Given** a viewer opens the session sheet, **When** it renders, **Then** it shows the role word "viewer" (localised), sign-out, and the language switch, and nothing else — no write affordance, disabled or otherwise.
4. **Given** an owner or admin whose payload says consolidation is `applicable`, **When** they open the sheet, **Then** the consolidation action is present; **Given** `applied` or `not_applicable`, **Then** it is absent, with no inert statement in its place.
5. **Given** a member on Cards, scrolled to any depth, **When** they use the bottom bar, **Then** they arrive on Home, and vice versa; the bar's items are links, and the bar mirrors under RTL while the mark does not.
6. **Given** a signed-in member, **When** they sign out, **Then** all cached household data is evicted before navigation, the browser lands on `/sign-in?signed-out`, and the next request to any API route answers 401.
7. **Given** no session, **When** `/` or `/cards` is requested, **Then** the server redirects to `/sign-in` (state A1, no error query) before rendering; the shell never paints for a signed-out person.
8. **Given** a valid session, **When** `/sign-in` is requested, **Then** the server redirects to `/`.

---

### User Story 3 — See the household's cards (Priority: P3)

A member opens Cards from the bottom bar and sees every card of their household in `sortOrder`, each with its name, balance, and its three optional values — each of which is shown as not recorded when it is `null`. A viewer sees exactly the same list with no write affordance. The list is fed by the same cached aggregated payload as Home and shares its single cache and reconcile cycle.

**Why this priority**: Cards is the only write surface and the place the editable-vs-read-only grammar is proven; the list is its precondition.

**Independent Test**: As a viewer and as a member, open `/cards` on the migrated household and verify four cards in `sortOrder`, ADIB at 600.00 after consolidation and the other three at a real 0.00, all twelve optional fields shown as not recorded, and that the viewer sees no create or edit affordance.

**Acceptance Scenarios**:

1. **Given** the migrated household after consolidation, **When** Cards renders, **Then** it shows `ADIB CC` 600.00, `HSBC CC` 0.00, `CASHBACK CC` 0.00, `Valu CC` 0.00 in `sortOrder`, with limit, statement day and due day presented as not recorded on all four.
2. **Given** a card with `balanceMinor: 0` and no linked liability rows, **When** it renders, **Then** the balance is a real `0.00 EGP`, not "not recorded".
3. **Given** a viewer, **When** Cards renders, **Then** no create or edit control exists on the page — not disabled, not hidden-until-tap.
4. **Given** the cached payload painted Cards and a reconcile returns a changed card, **When** no edit is active, **Then** the row updates in place; **When** that row is under an active edit, **Then** the update is deferred until the edit is committed or abandoned, while every other row may update.

---

### User Story 4 — Create and edit a card (Priority: P4)

A member with a writing role creates a card by naming it, optionally recording its credit limit, statement day, and due day; and edits an existing card's four fields, including clearing an optional value back to not recorded. Create and edit happen in place on `/cards` — the edit state is not a route; back closes the form without saving. Every write applies optimistically, then visibly rolls back with an error toast if refused, keeping what the person typed for retry.

**Why this priority**: The first user-facing write in the product; it establishes the optimistic-write and rollback pattern every later write follows.

**Independent Test**: As a member, create a card and verify it appears immediately and survives the reconcile; edit each field including clearing one to `null`; submit a duplicate name and a day of 32 and verify client-side refusal; force a server refusal (concurrent duplicate) and verify rollback with toast and retained input; verify the audit record exists for each accepted write.

**Acceptance Scenarios**:

1. **Given** a writing-role member on `/cards`, **When** they create a card with a valid name, **Then** the list shows the card immediately, the create request is sent, and on `201` the row is reconciled to the server's card object (identical in shape to the state payload's card rows).
2. **Given** an existing card, **When** the member edits any of its four fields, including setting an optional field to not recorded, **Then** the change shows immediately and the `PATCH` sends only the changed fields, with `null` for a cleared one.
3. **Given** input that violates FR-017 of Feature 004 (empty name, duplicate name, negative limit, day outside 1–31, non-integer minor units), **When** submitted, **Then** the client refuses it before any optimistic write, naming the field; the server remains the authority and a `422` is handled as one more rollback case.
4. **Given** a write that the server refuses or that fails in transit, **When** the refusal arrives, **Then** the optimistic change is visibly reversed, an error toast is shown, and the person's input is retained for retry.
5. **Given** a write answered `403` or `404`, **When** the refusal arrives, **Then** the change is rolled back, a full re-read follows, the affordance disappears through that re-read if the role no longer permits it, the failure is shown as a page state, and no retry is offered.
6. **Given** an edit is open, **When** the person navigates back, **Then** the form closes and nothing is written.

---

### User Story 5 — Apply the one-time consolidation (Priority: P5)

An owner or admin of the migrated household opens the session sheet, sees the consolidation action because the payload says it is applicable, confirms it, and the household's figures change exactly as Feature 004 specifies. Afterwards the action is gone. Any other household's owner never sees it.

**Why this priority**: It is the only admin action in the product and the only way the migrated household reaches its correct figures; it lands last because it depends on Home, the shell, and the sheet.

**Independent Test**: As owner of the migrated household, apply the correction through the sheet; verify the confirmation step, the `200`, the full re-read, short-term liabilities +600.00, both net-worth figures −600.00, ADIB at 600.00, 15 accounts, 9 liabilities, and that the action is absent afterwards; verify the action never appears for a fresh household's owner nor for a member or viewer.

**Acceptance Scenarios**:

1. **Given** `consolidation: "applicable"` and role owner or admin, **When** the sheet opens, **Then** the action is present; **When** the person triggers it, **Then** a confirmation step precedes the request; **When** confirmed, **Then** the request is sent and on `200` a full re-read replaces the cached state — never a local patch.
2. **Given** `consolidation: "applied"`, **When** the sheet opens, **Then** the action is absent and nothing is stated in its place.
3. **Given** a member or viewer, **When** the sheet opens, **Then** the action is absent regardless of the applicability value.
4. **Given** two admins race, **When** the second request arrives after the first succeeded, **Then** it is answered `409 already_applied`, nothing is written, and the client handles it by full re-read.

---

### Home state matrix (carried from Brief §4 and handoff 02 §5, unchanged)

Every case is real and reachable. Two cases sharing one treatment is a legitimate answer as long as it is stated. **The three that decide whether this holds up: B5 the empty household; B12 the stale-rate treatment; B15 never-recorded versus zero.**

**Session** — B1 signed in, valid · B2 session expires while the screen is open; the next read is refused; the person lands at sign in with nothing cached still showing · B3 signed in with no household membership — fails safely, discloses nothing · B4 signed in with more than one membership — never silently picks one.

**Household content** — B5 brand-new, completely empty household: every figure zero, `nextDueOn` null, 21 zero buckets, 5 zero asset-mix rows · B6 the migrated household before the correction · B7 the same after it: short-term liabilities +600.00, both net-worth figures −600.00, ADIB at 600.00, 15 accounts, 9 liabilities, nothing else moves · B8 partially populated: 56 installments against 1 transaction.

**Role** — B9 owner/admin: everything including the correction · B10 member: writes cards, correction refused · B11 viewer: read-only, **no write affordance shown at all**.

**Data quality that must stay visible** — B12 rate age in three degrees, fresh / dated / stale, currently stale · B13 stated versus derived beside every balance · B14 superseded rows beside their live correction, only the live one counting · B15 **never recorded versus zero, never the same** · B16 a figure that cannot be computed because a class has no rate — a loud error state, never a quiet zero, and (new in 005) never a failed read.

**Language and direction** — B17 English LTR · B18 Arabic RTL, full mirror including the bottom bar and any chart legend · B19 mixed direction: `فرش` inside an English list; `HSBC EGP`, `Thndr`, `SABIKA` inside an Arabic one · B20 Latin digits and `mm/dd/yyyy` in both languages.

**Network and speed** — B21 cold load, no cache · B22 cached revisit, then reconcile · B23 read fails, cache present · B24 read fails, no cache.

**Scale and overflow** — B25 `−7,824,830.81 EGP` on a phone in both directions without truncating or wrapping into nonsense · B26 56 installments and 21 year buckets, most zero · B27 long or mixed-script names in narrow rows · B28 ten accounts at exactly zero.

### Edge Cases

- A cached Home paints, then the reconcile returns 401: the painted content is evicted and the browser navigates to sign in. "Rendered, then evicted" is accepted behaviour, not a defect (R5).
- A's session expires with the tab closed; B signs in on the same device: A's cached household must never paint for B (FR-027).
- A rate exists for a class but only with `asOf` after `today`: for conversion on `today` this is a missing rate (R1/R2), and the as-of gap names the earliest rate the class has.
- A class holds zero native quantity and has no rate: no conversion is needed, the class converts to zero, and nothing is marked uncomputable (R1).
- A transaction whose pinned `rateId` no longer resolves: a broken reference, not a missing-rate condition; the read fails with the generic server-error envelope (R4).
- A correcting liability row carries the same name as the row it supersedes (`CC ADIB` twice after D7): both are shown; only the row nobody points at counts (R11).
- A chain of corrections of depth ≥ 2: the live row is the one no `reversesId` names; every intermediate row is superseded (R11).
- The device clock is on a different calendar day from Cairo: every due, overdue, and rate-age computation uses the payload's `today`; the device clock is never consulted (R9).
- A reconcile completes while a card edit is open: the edited row is not replaced until the edit is committed or abandoned (FR-026).
- The person switches language while a toast is showing or an edit is open: the switch re-renders in place; the edit's input is retained.
- Two memberships: every route answers `500 ambiguous_household`; Home is a terminal page state offering only sign-out (R6).

## Requirements *(mandatory)*

Requirements are grouped by concern. Tags in brackets name the contract decision (R1–R15) or the clarification answer (A1–A28 for the 2026-09-03 answers) a requirement records.

### A. Routes and the shell

- **FR-001** [R7, A15, A16]: `/` MUST exist and be Home; the sign-in success callback MUST land there. `/cards` MUST exist and be the Cards page. Before rendering `/` or `/cards`, the server MUST check the session and, absent one, redirect to `/sign-in` (state A1, no error query — arriving without a session is not an error). With a valid session, a request for `/sign-in` MUST redirect to `/`. A signed-out person never sees the shell paint; cache-first applies to the data read, not the document request.
- **FR-002** [A1]: Card create and edit happen **in place on `/cards`**. The edit state is not URL-addressable; back closes the form without saving. Whether the form is a sheet or inline is a design decision.
- **FR-003** [decided by design]: The bottom bar contains exactly two destinations, Home and Cards, reachable from any scroll depth; its items MUST be links (not callbacks), with ≥ 44px targets, and the bar mirrors under RTL.
- **FR-004** [decided by design]: The header carries the Qist mark via `BrandLockup` (constitution VII.3) and one control that opens the session sheet. The layout mirrors under RTL; the mark does not.
- **FR-005** [A11, A13]: The session sheet shows the member's **role as a localised word** (from the payload's `role`) and offers: sign-out; the language switch; and, only when the payload's consolidation applicability is `applicable` **and** the role is owner or admin, the consolidation action. It shows **no user identity and no household name** (identity would need a second read; the payload carries no household name) — out of scope for 005, not future work. When applicability is `applied` or `not_applicable`, the action is absent with no inert statement in its place (the payload carries no applied-on date and the audit log is not exposed, so there is nothing truthful to state).
- **FR-006** [R7, A17]: Sign-out MUST evict all cached household data, then navigate to `/sign-in?signed-out`.

### B. Locale

- **FR-007** [R8]: The shell reads the `qist-locale` cookie on the server for first paint and owns the root `<html lang dir>`; the hard-coded `en`/`ltr` root is removed. Default `en`. Path-based locale routing is explicitly out of scope for 005.
- **FR-008** [R8]: The language switch writes the cookie and re-renders every screen in place — root `lang`/`dir`, every UI string, direction of every mirrored element — **without a re-fetch**. The payload carries no locale-bearing content except the asset-mix label, which the client MUST map by `sheetRef` or position, never by translating the string.
- **FR-009** [A26]: 005 establishes the one shared UI-string dictionary the constitution (Principle V) requires and moves the sign-in copy into it **byte-for-byte**; no sign-in string changes.
- **FR-010** [A25]: 005 MAY modify sign in to defer to the root `lang`/`dir` and drop its per-screen `dir`, under this constraint: sign-in's in-place switch behaviour and all of its states in both languages are unchanged, and regression against the Sign in handoff spec is an acceptance criterion.
- **FR-011** [A27, constitution VII.4]: Written Arabic is a **completion requirement**: nothing in 005 ships English-only. The source of every Arabic UI string is the approved design handoff — design proposes, the product owner approves as the native speaker. Claude Code never authors Arabic copy; a missing Arabic string is a blocker, not a placeholder.

### C. The Home read — contract decisions

- **FR-012** [R1]: `GET /api/state` MUST succeed for a household with no rates, no accounts, nothing. A rate is required for a class only when that class holds a non-zero native quantity; a zero quantity converts to zero without a rate and is not marked uncomputable. The representation of "no rate for class X" is **Proposal P1** (§Proposals).
- **FR-013** [R2]: The read MUST never fail because a class has no rate on or before `today`. Every converted figure for that class, and every total that depends on it, is marked uncomputable; everything else renders. The client MUST be able to name the class and the as-of gap (today versus the earliest rate the class has, or that it has none). Payload shape is **Proposal P1**.
- **FR-014** [R3]: The state payload MUST carry a field stating, for this household and this role, consolidation applicability as exactly one of `not_applicable`, `applicable`, `applied`. The client never infers applicability from a server-side constant it does not have and never shows a control that will be refused. The action is one-time and not reversible; a repeat is `409 already_applied`.
- **FR-015** [R4]: Every non-2xx response MUST carry a JSON body `{"error": "<code>"}`; no bare 500. The codes Home and Cards MUST handle: `unauthenticated` (401), `not_found` (404 — no membership, or a card that is not the caller's), `forbidden` (403), `invalid` (422, with `reasons`), `already_applied` (409), `not_applicable` (409), `ambiguous_household` (500), plus the generic server-error code for anything else unmapped — **Proposal P2**. Missing rates no longer produce an error (FR-012/013).
- **FR-016** [R12]: Derived balance mode: the read currently fills `quantityMinor` with the opening quantity for derived accounts and never adds movements. 005 resolves this by **Proposal P4**.
- **FR-017** [R13]: The monthly rollup window rule is **Proposal P5**; whichever option is approved, the payload keeps exactly 24 rows.
- **FR-018** [R15]: The card object MUST be identical in shape between the state payload and the cards endpoint — **Proposal P6** (today `createdAt` exists on one only).

### D. Session, errors, terminal states

- **FR-019** [R5]: On any 401 the client MUST evict all cached household data **before** navigating to `/sign-in?error=<value>` so it lands on sign-in state A3 ("Not signed in"). The value is **Proposal P3** and MUST NOT disclose why (expired, revoked, never — indistinguishable by design). The stale window is structural: cached Home may paint before the 401 arrives; "rendered, then evicted" is accepted behaviour.
- **FR-020** [R6]: No membership (`404 not_found` from the state read) and two memberships (`500 ambiguous_household`) are **terminal page states on Home** that disclose nothing and offer only sign-out. No chooser — not in plan.
- **FR-021** [A10]: A cold-read failure with no cache is transient, unlike FR-020: a page state with **one retry action**; sign-out remains reachable.

### E. Cache and reconcile (requirement only — mechanism belongs to plan)

- **FR-022** [R14, A19]: Cold load with no cache shows structure at real row geometry: fixed-shape sections (21 year buckets, 5 asset-mix rows, 24 rollup months, the two net-worth figures, the installment summary) at exact geometry; variable-length lists at a design-specified placeholder row count. Never a spinner, never a blank screen.
- **FR-023** [R14]: A revisit paints the cached payload before any network request.
- **FR-024** [R14]: Reconcile is a full re-read compared client-side, with exactly three outcomes: no change; changes applied in place; failed — cached content stays and the failure is shown as a page state, never a toast.
- **FR-025** [A2]: Home and Cards share **one read, one cache, one reconcile cycle**. `/api/cards` is used for writes only.
- **FR-026** [A20]: A reconcile never replaces a row under an active edit; that row's change applies after the edit is committed or abandoned. Everything outside the edited row may update in place.
- **FR-027** [A18]: A successful sign-in evicts the cache before the first read; and a cached payload whose `householdId` differs from the fresh read's is never painted. Rationale: A's session expires with the tab closed (no 401 ever observed), B signs in on the same device — without these two rules A's household would paint for B.

### F. Numerals, direction, money

- **FR-028** [R9, A28]: One client-side helper is the only place formatting happens: minor units → display string. EGP: two decimals, comma thousands, dot decimal, leading minus U+2212 (never a hyphen), `EGP` trailing, one isolated LTR run in both languages — only its position mirrors. USD native amounts follow the same rule with `USD` trailing: `2,444.00 USD`. The number–unit joiner is **U+202F narrow no-break space** in every case. Grams display **three decimals** from milligram storage, `g` trailing: `22.500 g`, `750.000 g`. Rate values are not required on Home in 005 (the age is); the helper MUST support them as bare numbers with a unit expression at **four places** if ever shown. (Decimals settled at the Stage 1 design review, 2026-09-03.) Nothing arrives formatted from the server. The ported `AmountDisplay` is retired.
- **FR-029** [R9]: `today` for every due, overdue, and rate-age computation is the payload's Cairo `today`, never the device clock. Home states that date once (placement is design) [A9].
- **FR-030** [Brief §5]: Latin digits in both languages, always. Dates `mm/dd/yyyy`. Digits, amounts and dates are direction-isolated LTR inside Arabic; Arabic runs are isolated inside English. Household data (account, card, liability, plan names) is never translated and appears exactly as entered. Columns of figures align down the column. `−7,824,830.81 EGP` holds on a phone in both directions without truncation or wrapping into nonsense.

### G. Rate age and supersession

- **FR-031** [R10]: Rate age is client-derived from the rate's `asOf` versus the payload's `today` in whole calendar days: **fresh = 0, dated = 1–7, stale = 8+**. The rate in use per class is the newest with `asOf` on or before `today`. The server helper's 7-day constant is CLI-only and MUST NOT drift from this rule. Holdings convert at today's rate; transactions at their pinned rate; two ages on one screen is expected. A stale rate must never be able to pass as current.
- **FR-032** [R11]: The client derives the superseded set from every `reversesId` on liabilities and transactions; live rows are those nobody points at; chains of depth ≥ 2 are handled. Raw arrays are never summed client-side — derived totals are already netted. Correcting rows may carry the same name as the rows they supersede; both are shown, distinguishable, and only the live one counts.

### H. Home content

- **FR-033** [A7]: Home presents **every section the payload carries** — including superseded liability rows, the empty `cardPayments` section, and all 24 rollup rows. No section is omitted. Order, grouping, collapse, and what sits above the fold are design, bound by the anchor rule. An empty section renders as an empty state and never disappears (disappearing is indistinguishable from "not in plan").
- **FR-034** [Brief §4]: Two net-worth figures, never one. Neither is labelled "net worth" unqualified; the one omitting property installments says so where it is shown.
- **FR-035** [Brief §4]: Balance mode (`stated` / `derived`) is visible wherever a balance is shown.
- **FR-036** [Brief §4, B15]: Never-recorded (`null`) and zero never render the same. This applies to the snapshot's `netWorthInclInstallmentsMinor`, every `savingsRate` for a month with no income, every card's `limitMinor` / `statementDay` / `dueDay`, and any other `null`.
- **FR-037** [A8]: When `nextDueOn` is `null` there is no next installment: `nextAmountDue` is not presented as money and `0.00` MUST NOT appear; the summary states there is no upcoming installment (wording is design, requested at Stage 1).
- **FR-038** [Brief §4]: Installment status is client-derived against `today`: paid = `paidAt` non-null; overdue = unpaid and `dueOn` before `today`; due = unpaid and `dueOn` on or after `today` — matching the server's `installmentSummary.overdue` rule.

### I. Cards

- **FR-039** [A3, A4]: All four card fields are editable by a writing role; clearing an optional field back to `null` is in scope. `sortOrder` is display order only; there is no reorder control.
- **FR-040** [Brief §4]: Writes are optimistic: the screen updates immediately, then visibly rolls back with an error toast if the write is refused or fails in transit. There is a stated "not yet confirmed" moment (treatment is design).
- **FR-041** [A21]: Feature 004's FR-017 validation rules are re-applied client-side before the optimistic write; the server remains the authority; a `422` is one more rollback case.
- **FR-042** [A22]: After a rollback the person's input is retained for retry.
- **FR-043** [A23, A24]: A `403` or `404` on a write: rollback, then full re-read; the affordance disappears through the re-read if the role no longer permits it; failure shown as a page state; no retry offered.
- **FR-044** [Roles, unchanged]: viewer = read + sign-out + language; member adds card create/update; admin adds consolidation; owner is identical to admin on every endpoint. A viewer is shown no write affordance at all — not even a disabled one.

### J. Consolidation

- **FR-045** [A12, A14]: The consolidation action requires a **confirmation step** before the request. On `200` the client performs a **full re-read**, never a local patch (list lengths and `totalOfAll` change). On `409 already_applied` the client re-reads.

### K. Ported components

- **FR-046** [R15]: Bottom navigation is link-based and tested under RTL. Any ported component with physical-side properties (`margin-right`, `left:`, `text-align: left`, …) is converted to logical properties before use. No component or token outside the constitution's VII.2 allowlist is introduced until its handoff spec lands in `design/handoff/`.
- **FR-047** [Stage 1 review, A9]: Design proposes a change to the ported `PanelHeader` (`components/ui/PanelHeader.tsx`, imported at `13e8a3f`, not an external dependency): an optional leading slot for the mark and an optional title. This is a **modification to a ported component** and is gated exactly as any design-system addition — nothing is implemented before its handoff spec lands in `design/handoff/`.

### L. Exclusions (hard stop — not future work, not placeholders, not disabled behaviour)

Everything in Brief §2's "not in plan" list: logging a transaction, marking an installment paid, editing an account balance or a liability, property paid-to-date, snapshots, card payments, income settings, inviting household members, changing roles, deleting or archiving a card, refreshing a rate on demand. Also out of scope for 005: card reordering; a household chooser; user identity or household name in the shell; path-based locale routing; rate values on Home.

### Key Entities

- **Aggregated state**: the one payload Home and Cards read — context (`householdId`, `timezone`, `today`, `role`), nine raw sections, and `derived`. 005 adds consolidation applicability, a missing-rate representation, and (per P6) `createdAt` on cards.
- **Cache**: the client's discardable copy of the last aggregated state for one household; never a source of record; evicted on 401, sign-out, and sign-in; never painted for a different `householdId`.
- **Card**: name plus three optional values, each independently recordable or not recorded; identical shape on both endpoints.
- **Rate in use**: per class, the newest rate with `asOf` ≤ `today`; carries an age the client classifies.
- **Superseded row**: a liability or transaction named by another row's `reversesId`; shown, distinguishable, not counted.

## Success Criteria *(mandatory)*

- **SC-001**: A brand-new household's Home read succeeds and renders every section in 100% of attempts (today it fails with HTTP 500).
- **SC-002**: A household with a non-zero holding in a class lacking a rate renders every unaffected figure and marks every affected one uncomputable, naming the class and as-of gap, in 100% of cases; the read never fails for this reason.
- **SC-003**: 100% of non-2xx responses across the surface carry the JSON error envelope; a contract test enumerates every listed code.
- **SC-004**: On every cached revisit, cached content is on screen before the first network request is issued; on every cold load, structure is on screen before the read returns; a blank screen or spinner is never observed.
- **SC-005**: 100% of `null` values in the payload render as not recorded and never as `0`, `0.00`, or `0%`; `nextAmountDue` never shows `0.00` when `nextDueOn` is `null`.
- **SC-006**: Every converted figure carries its rate age; with the 2026-08-17 rates on any date from 2026-08-25 onward, 100% read as stale.
- **SC-007**: Across every screen in both languages, 100% of digits are Latin, 100% of dates are `mm/dd/yyyy`, every money string is one isolated LTR run with `EGP`/`USD` trailing and U+2212 for negatives, and `−7,824,830.81 EGP` renders untruncated on a 375px-wide viewport in both directions.
- **SC-008**: For each of the four roles, the session sheet and Cards page show exactly the permitted action set; a viewer is shown zero write affordances.
- **SC-009**: 100% of refused or failed card writes roll back visibly with a toast and retain the person's input; 100% of accepted writes are reflected after reconcile with an audit record.
- **SC-010**: After a 401 or sign-out, zero cached household figures remain in browser storage; after sign-in as a different user, zero figures from the previous household are painted.
- **SC-011**: The consolidation action is visible only when applicability is `applicable` and the role is owner/admin; after `200`, Home shows short-term liabilities +600.00, both net-worth figures −600.00, 15 accounts, 9 liabilities, and the action is absent.
- **SC-012**: Language switch changes `<html lang dir>` and 100% of UI strings in place with zero network requests and zero changes to household data; first paint under the `ar` cookie is already RTL.
- **SC-013**: Sign in passes its existing state and copy tests unchanged after the root-`lang`/`dir` and dictionary moves.
- **SC-014**: Every ported component used in 005 passes an RTL mirroring test; the mark's test asserts it does not.
- **SC-015**: Zero Arabic UI strings are missing or machine-generated at completion; every one traces to an approved handoff.

## Proposals — approved by the product owner on 2026-09-03

| # | Item | Proposal | Rationale |
|---|---|---|---|
| **P1** | R1/R2 — "no rate for class X" representation | **Approved 2026-09-03, as amended.** (a) A rate is required only for a class with non-zero native quantity; zero converts to zero, `converted: false`. (b) When required and absent: that class's `egpMinor` in `totalHoldings` / `investmentHoldings` / `assetMix`, and every total that sums it (`liquidTotal`, `investmentTotal`, `totalOfAll`, all six `netWorth` fields as affected), become `null`. (c) A new top-level `derived.missingRates: [{ assetClass, onDate, earliestAsOf }]` names each class, the date conversion was attempted (`today`), and the earliest rate the class has or `null` for none. (d) **Per-block `null` rule** — in raw rows (`accounts`, `liabilities`, `cards`, `snapshots`, …) `null` means never recorded, unchanged; in `derived`, `null` on a money field means **uncomputable, always** — `missingRates` is the explanation the client uses for wording (class and gap), not the thing that gives `null` its meaning; in `derived`, exactly two non-money `null`s exist and mean not-applicable by arithmetic: `monthlyRollup[].savingsRate` (zero income) and `installmentSummary.nextDueOn` (no upcoming installment) — **no other `null` is permitted in `derived`**. (e) Invariant, tested both ways: a `null` money figure in `derived` exists **iff** `missingRates` is non-empty and names a class that figure depends on. | `derived` is computed, never recorded, so "never recorded" has no meaning inside it. A client that ignores the list still renders "Cannot be computed" rather than "Not recorded" — degraded, not false. |
| **P2** | R4 — generic server-error code | **Approved.** `500 {"error": "internal"}` for any unmapped throw (including a transaction whose pinned rate does not resolve). | Closes "no bare 500" without inventing per-cause codes the client cannot act on differently. |
| **P3** | R5 — `/sign-in?error=<value>` | **Approved.** `error=unauthenticated`; no sign-in change. | Mirrors the envelope code the API already uses; names the state, not the cause; sign in already renders any `error` value other than `OWNER_UNCONFIGURED` as A3. |
| **P4** | R12 — derived balance mode | **Approved.** Record as a **known defect**, and assert (by negative test) that no product path — no route, no screen — can create or switch to a derived account in 005; the client renders `balanceMode` as received. | No write path or screen produces a derived account; computing true derived balances in the read would touch derivations and goldens for a figure nothing can display. Fix belongs to the feature that adds account writes. |
| **P5** | R13 — rollup window | **Approved.** The 24 rows are the payload's `today` month and the 23 months before it (window ends at the current month). Parity/golden tests keep passing the sheet-anchored spine explicitly, so 003's evidence is unchanged. **Design note**: this changes the Home meta line design currently shows — "from 08/2026" becomes "to 09/2026"; the product owner will tell design. | The current month must be present for the rollup to mean anything on Home; the first-transaction anchor existed for spreadsheet parity, which the explicit-months parameter preserves. |
| **P6** | R15 — card shape | **Approved.** Add `createdAt` to the state payload's card rows as a superset; the cards endpoint is unchanged. **`createdAt` is not a display requirement** — FR-033's "every section is presented" is about sections, not every field. | Superset is the non-breaking direction; the cards endpoint already returns it. |

## Open items — owner named

| Item | Owner | Gate |
|---|---|---|
| Alexandria as the Arabic UI face | Product owner approves | Before any Arabic screen ships |
| Arabic labels for the two net-worth figures | Design proposes, product owner approves | Home handoff |
| Arabic labels for "Not recorded" and "Cannot be computed" | Design proposes, product owner approves | Home handoff |
| Arabic labels for the five asset-mix rows | Design proposes, product owner approves | Home handoff |
| Design's A9 change to `PanelHeader` (leading mark slot, optional title) | Design proposes; handoff spec in `design/handoff/` | Before implementation (FR-047) |
| Whether the "dated" (1–7 day) rate state survives as a distinct treatment | Design, at Stage 1 | Home handoff; FR-031's thresholds stand either way |
| Home rollup meta line ("from 08/2026" → "to 09/2026" under P5) | Product owner informs design; design updates | Home handoff |
| Wording for "no upcoming installment" | Design (requested at Stage 1) | Home handoff |
| Placeholder row counts for variable-length lists on cold load | Design | Home handoff |

## Assumptions

- The four API routes of Feature 004 remain the entire server surface; 005 changes response shapes only as FR-012–018 state and adds no new route beyond the page routes.
- Session lifetime and renewal are unchanged from 004 (library default).
- The `qist-locale` cookie contract (`en`/`ar`, default `en`, one year) is unchanged.
- The migrated household is the only household for which consolidation is ever `applicable`; the server decides applicability from its pinned anchors, the client only reads the field.
- Visual treatments for every state named here (stale, not recorded, uncomputable, superseded, stated/derived, not-yet-confirmed, rollback toast, empty states, page-state failures) come from the signed-off Home and Cards handoffs and are not decided by this spec.

## Dependencies

- Sign in as delivered at merge `cfef855` (handoff `05436e0`; Arabic A4 copy `7181ffb`).
- Feature 004 complete: the aggregated read, card writes, consolidation, and the error-mapping table.
- Constitution v3.0.0, Principle VII (dark-only polarity, frozen Emotex with its allowlist, the mark rules, type, numerals/direction/money, scope hard stop, vendor controls).
- The signed-off Home handoff spec in `design/handoff/` before `/speckit-plan`; the signed-off Cards handoff spec before Cards implementation.
