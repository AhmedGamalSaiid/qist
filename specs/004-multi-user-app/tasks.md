# Tasks: Multi-User Application

**Input**: Design documents from `specs/004-multi-user-app/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md) (R1–R12), [data-model.md](data-model.md), [contracts/http-api.md](contracts/http-api.md), [contracts/data-layer.md](contracts/data-layer.md), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — the specification mandates them (SC-006, SC-010, the contract-test obligations in http-api.md, and research R12 name the suites as planned deliverables).

**Organization**: Tasks are grouped by user story so each story is an independently testable increment.

**Binding constraint (restated from plan.md / spec.md)**: NO task below designs or implements any page, screen, layout, component, styling, color, typography, or navigation — including a styled sign-in page. The surface ends at route handlers, library code, migration, scripts, tests, and CI. The final task is the explicit STOP at the UI boundary.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4, mapping to spec.md's user stories
- Every task names exact file paths

---

## Phase 1: Setup (scaffold + runtime helpers)

**Purpose**: The Next.js/OpenNext scaffold, dependencies, env plumbing, and test wiring — everything that must exist before any schema or code lands.

- [X] T001 Verify the Feature 003 baseline is green before touching anything (quickstart V1): `npm run typecheck && npm run lint:money && npm run coverage:check && npm test` — all suites pass on both drivers, goldens byte-identical. This is the standing precondition (SC-010); re-run it after every phase below.
- [X] T002 Add Feature 004 dependencies and app scripts to `package.json`: `next@16`, `@opennextjs/cloudflare`, `better-auth`, `@better-auth/cli` (dev); add the `dev` script (Next.js + OpenNext local per research R10). No other runtime dependency (bundle budget, R5/R7).
- [X] T003 [P] Scaffold the headless app shell: `next.config.ts`, `open-next.config.ts`, `wrangler.jsonc` with the local D1 binding (dev/tests only — no deploy config), and `.dev.vars.example` documenting `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `OWNER_EMAIL` (quickstart Prerequisites). No page, layout, or component files — API routes only.
- [X] T004 [P] Create `lib/runtime/index.ts` with the two boundary-only helpers `newId()` (`crypto.randomUUID()`) and `now()` (`Date.now()`) per research R5; `lib/` write functions keep taking explicit `id`/`at` parameters — verify `lint:money` still passes (no `new Date()` on monetary paths).
- [X] T005 [P] Wire the new test suites (research R12 — planned deliverables, not incidental setup): add `test:auth` and `test:contract` scripts to `package.json` following the existing `scripts/vitest-runner.mjs` pattern, and extend `D1_SUITES` in `vitest.config.ts` with `tests/auth/**`, `tests/contract/**`, and the new card/consolidation write suites.

**Checkpoint**: `npm ci` clean, scaffold builds, V1 still green.

---

## Phase 2: Foundational (migration 0001, errors, derivations, shared read path)

**Purpose**: The one additive migration and the shared code every story depends on. **BLOCKS all user stories.**

- [X] T006 Generate the Better Auth schema (`npx @better-auth/cli generate`) against the configured model names and hand-fold the output into a new `db/schema/auth.ts`: `auth_sessions`, `auth_accounts`, `auth_verifications` exactly per data-model.md (identity plane — **no `household_id`** on any of them); verify column lists against the installed Better Auth version (R1 caveat) and export from `db/schema/index.ts`. [Verified directly against the installed `better-auth@1.7.2` table-builder source rather than the CLI's file output — the CLI needs a live `auth` instance and this design's `createAuth(client, env)` is a factory, not a ready instance. Found one real divergence: the `account` model carries an `issuer` column with uniqueness on `(issuer, account_id)`, not `(provider_id, account_id)` as originally sketched — folded into `db/schema/auth.ts` and documented there.]
- [X] T007 [P] Add the two Better Auth columns to `users` in `db/schema/tenancy.ts`: `email_verified` INTEGER NOT NULL DEFAULT 0 and `updated_at` INTEGER NOT NULL DEFAULT 0 (data-model.md — existing columns untouched).
- [X] T008 [P] Add the correction grammar to `liabilities` in `db/schema/holdings.ts`: nullable `card_id` (composite FK `(household_id, card_id)` → `cards`), nullable `reverses_id` (composite self-FK), `CHECK (reverses_id IS NULL OR reverses_id != id)`, and the partial `UNIQUE (household_id, reverses_id) WHERE reverses_id IS NOT NULL` (data-model.md — this index is what makes the D7 consolidation impossible to apply twice). [The `card_id` FK to `cards` is hand-folded into the migration SQL rather than declared via Drizzle's `foreignKey()` — importing `cards` from `ledger.ts` into `holdings.ts` would create a circular schema-module dependency (`ledger.ts` already imports `accounts` from `holdings.ts`), which breaks at load time. Documented in `holdings.ts`.]
- [X] T009 [P] Add the card-name uniqueness index to `cards` in `db/schema/ledger.ts`: `cards_household_name_unique` — `UNIQUE (household_id, lower(name))` expression index (data-model.md / R7). No new columns. [Hand-folded into the migration SQL — documented in `ledger.ts`.]
- [X] T010 Generate migration `db/migrations/0001_*.sql` with `npm run db:generate`; hand-fold into the generated SQL anything Drizzle Kit cannot express (the `lower(name)` expression index, any auth-table divergence — same discipline R1 applies); include the `updated_at` backfill to `created_at` for existing `users` rows and the pre-creation assertion that existing card names already satisfy the unique index (data-model.md).
- [X] T011 Apply the migration locally (`npm run db:migrate:local`) and prove it changes no figure: re-run quickstart V2 (fresh import into a scratch `.data/parity.db` + `npm run reconcile -- --db`) — exit 0, report identical to Feature 003's evidence. [`scripts/migrate-local.ts` gained a `--db` flag to match `import.ts`/`reconcile.ts` — quickstart V2 as written required it and it didn't exist. Also hand-fixed a drizzle-kit generation defect: its own copy-statement for the `liabilities` table recreate selected `card_id`/`reverses_id` from the pre-migration table, which doesn't have those columns — now selects NULL for both, matching "NULL for every imported row".]
- [X] T012 [P] Add the new typed errors to `lib/errors.ts` (contracts/data-layer.md list): `UnauthenticatedError`, `NoHouseholdError`, `MultipleHouseholdsError`, `UnauthorizedRoleError`, `OwnerUnconfiguredError`, `CardNotFoundError`, `CardValidationError(reasons)`, `ProvisioningConflictError`, `ClaimAlreadyMadeError`, `AlreadyAppliedError`, `NotApplicableError`.
- [X] T013 [P] Create `app/api/_lib/respond.ts` — the single error→HTTP mapping table (never per-handler): `401 {"error":"unauthenticated"}`; `404 {"error":"not_found"}` byte-identical for foreign and nonexistent ids; `403 {"error":"forbidden","requires":…}` only inside the caller's own household; `422 {"error":"invalid","reasons":[…]}`; `409` `already_applied` / `not_applicable` (contracts/http-api.md Universal semantics).
- [X] T014 [P] Extend the derivation layer (contracts/data-layer.md): `lib/derive/types.ts` — `LiabilityLike` gains `reversesId: string | null` and `cardId: string | null`, add `CardLike`; `lib/derive/totals.ts` — `shortTermLiabilities` applies the reversed-entry netting rule (a row whose id appears as another row's `reverses_id` stops contributing; the correcting row contributes instead); new `lib/derive/cards.ts` — `cardBalances(cards, liabilities)` = Σ non-reversed linked rows, 0 for cards with no linked rows. The netting rule is the identity on data with no reversals — **every 003 golden must remain byte-identical** (verify with `npm run test:golden`). [Golden suite confirmed byte-identical: 165/165 tests pass on both drivers.]
- [X] T015 Extend `loadHouseholdState` in `lib/data/state.ts`: add `cards` and `cardPayments` to the parallel read batch and `derived.cardBalances` to the derived block (spec FR-010); everything else in `HouseholdState` unchanged — existing consumers and goldens untouched. [Also added `role` to `HouseholdState` (needed by `GET /api/state`'s documented response shape, contracts/http-api.md) and each card's derived `balanceMinor`.]

**Checkpoint**: migration applied, V1 + V2 green, derivations extended with zero golden drift. User stories can begin.

---

## Phase 3: User Story 1 — Sign in and reach only your own household (Priority: P1) 🎯 MVP

**Goal**: Google-only authentication with D1-persisted sessions; `sessionIdentity` as the sole `Identity` producer; first-sign-in household provisioning (atomic, audited); the aggregated `GET /api/state` read; household scope derived from the session only.

**Independent Test**: Two users with separate (test) accounts, distinct data seeded per household — every read/write by one touches only their own household, including requests explicitly naming the other's identifiers (all `404`-indistinguishable); unauthenticated and expired-session calls refused with nothing disclosed (spec US1 Independent Test, SC-001/SC-002/SC-003).

### Implementation

- [X] T016 [P] [US1] Create the Better Auth instance in `lib/auth/config.ts` — `createAuth(client, env)`: Google as the **only** provider, minimal scopes (`openid email profile`), no offline access, Drizzle adapter over the existing client, `auth_`-prefixed model names mapped onto `db/schema/auth.ts` and the existing `users` table, and the database hook that nulls `access_token`/`refresh_token`/`id_token` before any `auth_accounts` row persists (R1/R2, spec FR-001). Nothing outside `lib/auth/` imports Better Auth. [`AppEnv` (GOOGLE_CLIENT_ID/SECRET, BETTER_AUTH_SECRET, OWNER_EMAIL) is defined here, not in `app/api/_lib/runtime.ts`, and imported the other way — `app/` depends on `lib/`, never the reverse.]
- [X] T017 [US1] Implement `sessionIdentity(request, client)` in `lib/auth/session.ts` — verifies the Better Auth session cookie and returns the foundation's `Identity { userId }` or `null`; the **only** producer of `Identity` in the application (spec FR-006). Expired/revoked sessions return `null`, indistinguishable from no session (FR-004). [Takes the constructed `Auth` instance (`ReturnType<typeof createAuth>`) rather than reconstructing one per call from `client` alone — `createAuth` also needs `env` (Google credentials, the auth secret), which the contract's 2-arg sketch omitted; `requireContext` (T018) does the constructing.]
- [X] T018 [US1] Implement `requireContext(request, client)` in `lib/auth/context.ts` — composes `sessionIdentity` with the existing `householdContextFor`, resolving the household from the session user's memberships only: 0 → `NoHouseholdError`, >1 → `MultipleHouseholdsError`, no session → `UnauthenticatedError` (R3, contracts/data-layer.md). [Signature is `requireContext(request, client, env)` for the same reason as T017.]
- [X] T019 [P] [US1] Implement `provisionHousehold(client, input)` in a new `lib/data/provisioning.ts` — `households` insert + owner `memberships` insert + `audit_log` (`create`, entity `household`) in **one** `atomically` batch; refuses with `ProvisioningConflictError` if the user already holds any membership (contracts/data-layer.md, spec FR-005).
- [X] T020 [US1] Implement `onFirstSignIn(client, input)` in `lib/auth/on-first-sign-in.ts` and wire it into `createAuth`'s user-creation hooks — this story delivers the **provision** branch (calls `provisionHousehold` with boundary-generated ids/`at`); the claim branch and fail-closed guard land in US2 (R4). Household name and audit actor per data-model.md's state table.
- [X] T021 [US1] Mount the Better Auth handler at `app/api/auth/[...all]/route.ts` (sign-in initiation, OAuth callback, session read, sign-out; sign-out invalidates the server-side session row — contracts/http-api.md, Auth section).
- [X] T022 [US1] Implement `GET /api/state` in `app/api/state/route.ts`: `requireContext` → `loadHouseholdState` → response per contracts/http-api.md (adds `role`; cards carry derived `balanceMinor`); errors via `app/api/_lib/respond.ts`. No request field influences scope.
- [X] T023 [US1] Extend the exported surface: add `provisionHousehold` (+ types) to `lib/data/index.ts` and update the exact-name list in `tests/isolation/surface.test.ts`; structural assertions (no `export * from`, no driver imports, no `householdId:` repository parameters) still hold. `lib/data/` must not import `lib/auth/` (contracts/data-layer.md boundary).

### Tests

- [X] T024 [P] [US1] Create `tests/auth/session-identity.test.ts` and `tests/auth/provisioning.test.ts`: session → `Identity` binding; first sign-in provisions household + owner membership + audit in one atom (verify all-or-nothing on both drivers); expired/revoked session ≡ no session; a Google profile rename/picture change updates `users` and never creates a second user or household. Better Auth exercised against the test database through its own API — Google's endpoints never called (R12). [Session verification drives Better Auth's real `auth.api.getSession` against a directly-inserted `auth_sessions` row, authenticated via a hand-signed cookie replicating `better-call`'s HMAC-SHA256 scheme (`tests/helpers/auth.ts`) — this exercises our actual seam (the session) without needing Google's OAuth/JWT machinery, matching R12's "Google's endpoints are never called." The profile-rename-never-creates-a-second-user guarantee rests on `onFirstSignIn` firing only on Better Auth's own `user.create` lifecycle event (never `user.update`) plus Better Auth's own account-linking by `(issuer, account_id)` — the latter is Better Auth's own tested code, not re-tested here, consistent with R12's framing.]
- [X] T025 [P] [US1] Create `tests/contract/state.test.ts` and `tests/contract/auth-semantics.test.ts`: route handlers invoked as plain functions with constructed `Request`s — `401` on every route with no/expired session (obligation 1); `GET /api/state` returns every section in one response and derived figures match `deriveAll` on the same fixture (obligation 6). [Added a test-only runtime-injection seam, `app/api/_lib/runtime.ts`'s `__setTestRuntime`/`__resetRuntime` (`tests/helpers/runtime.ts`), so a route handler can be called directly against a test database with no Cloudflare Workers execution context — not itself a numbered task, but necessary plumbing implied by "route handlers invoked as plain functions."]
- [X] T026 [US1] Extend `tests/isolation/` with the session-derived adversarial matrix (SC-002, obligation 2): two households seeded, one user probing the other's data via path/query/body/header-named identifiers — every response `404`-indistinguishable, zero foreign rows disclosed or modified. [`GET /api/state` takes no request-supplied identifier at all, so the adversarial surface is proving that no query string or header naming the other household changes what the caller's own session resolves to — `tests/isolation/session-scoped.test.ts`.]

**Checkpoint**: US1 fully functional — a new user signs in, gets a provisioned household, reads their own state, and can reach nothing else. MVP.

---

## Phase 4: User Story 2 — The owner claims the migrated household (Priority: P2)

**Goal**: The operator-designated owner's first sign-in claims the migrated household (membership repointed from the importer's placeholder, audited, one-time); fail-closed sign-in while unclaimed and `OWNER_EMAIL` unset; guarded CLI recovery that parks — never deletes — a provably empty shell.

**Independent Test**: Designate an owner account, sign in with it, verify the session lands in the migrated household with all imported records readable through scoped paths; the placeholder cannot authenticate and holds no membership; the claim is audited; a second claim attempt is refused; a non-designated new user still gets a fresh household with no access to the migrated one (spec US2 Independent Test, SC-004).

### Implementation

- [X] T027 [US2] Implement `claimMigratedHousehold(client, input)` in `lib/data/provisioning.ts` (contracts/data-layer.md): one atomic batch repointing the migrated household's owner membership from the placeholder user (`owner@household.local`) to `newOwnerUserId` + `audit_log` (`update`, entity `memberships`, before/after); guarded — current holder must be the placeholder, else `ClaimAlreadyMadeError` with nothing written. `recoverEmptyShell` additionally parks the claimant's empty shell in the same atom (membership repointed onto the placeholder user + second audit entry anchored to the shell household, `shellAuditId`); refuses if the shell holds any domain row beyond its own membership. Nothing is ever deleted (data-model.md, parked-shell note). Export from `lib/data/index.ts` and update `tests/isolation/surface.test.ts`. [Also added `placeholderUserIdFor` and `findUnclaimedMigratedHouseholdId` as internal (unexported-from-index) helpers, reused by `onFirstSignIn`'s guard/claim branch and by `scripts/claim.ts`.]
- [X] T028 [US2] Complete `onFirstSignIn` in `lib/auth/on-first-sign-in.ts` (R4): add the **before-create fail-closed guard** — if an unclaimed migrated household exists (owner membership still held by the placeholder) and `ownerEmail` is null, throw `OwnerUnconfiguredError` *before* user creation, persisting nothing (no user, session, household, or audit row); add the **claim branch** — verified email equals `OWNER_EMAIL` → `claimMigratedHousehold` instead of provisioning. Inert on deployments with no unclaimed migrated household. [The guard is `assertSignInAllowed`, a sibling export in the same file, wired to `databaseHooks.user.create.before` in `lib/auth/config.ts` — it doesn't depend on the incoming user's identity, only on DB state and `OWNER_EMAIL`.]
- [X] T029 [P] [US2] Create `scripts/claim.ts` and add the `claim` script to `package.json`: `npm run claim -- --email <owner> [--db <path>]` — resolves the user by email, enforces the empty-shell precondition, calls `claimMigratedHousehold` with `recoverEmptyShell: true`, exits non-zero with the stated reason on any refusal (contracts/data-layer.md, R4 recovery path).

### Tests

- [X] T030 [P] [US2] Create `tests/auth/claim.test.ts` (and extend `tests/auth/provisioning.test.ts`): hook-path claim (membership repointed, audited, imported rows unchanged — spec FR-012); one-time (second attempt → `ClaimAlreadyMadeError`, zero rows written); fail-closed refusal with **nothing persisted** when `OWNER_EMAIL` is unset while unclaimed; non-designated user provisions normally with no access to the migrated household; placeholder user has no `auth_accounts` row and cannot authenticate (FR-011); recovery-script path — precondition refusal on a non-empty shell, successful park (shell membership → placeholder, both audit entries anchored, claimant holds exactly one membership).

**Checkpoint**: US1 + US2 — the migrated household is claimable, fail-closed pre-configuration, recoverable mis-designation.

---

## Phase 5: User Story 3 — Manage your own credit cards (Priority: P3)

**Goal**: The first user-facing write path — card create/update with full-reasons validation, role enforcement inside the data layer, structural per-household name uniqueness, and atomic before/after audit — plus the card HTTP surface.

**Independent Test**: One user creates and updates cards and observes the changes, the validation refusals (all defined invalid cases), and the audit records; a second user can neither see nor modify them (spec US3 Independent Test, SC-005, SC-006).

### Implementation

- [X] T031 [P] [US3] Create `lib/data/authz.ts`: `assertWriter(ctx)` (owner/admin/member) and `assertAdmin(ctx)` (owner/admin), throwing `UnauthorizedRoleError`; called at the **top of data-layer write functions**, never in handlers, so an unguarded write is not expressible through the exported surface (R8). Reads require membership only — viewer reads everything in its household.
- [X] T032 [P] [US3] Create `lib/data/validate-cards.ts`: full-reasons validation (never first-failure-only) per spec FR-017 — name required, non-empty after trim, ≤ 120 chars, case-insensitively unique in household (uniqueness fed by the caller's pre-read); `limitMinor` a non-negative integer (minor units); `statementDay`/`dueDay` integers 1–31; explicit `null` clears an optional field on update; returns the `reasons` list shaped for the `422` payload.
- [X] T033 [US3] Create `lib/data/cards.ts` with `createCard(client, ctx, input)` and `updateCard(client, ctx, input)` (contracts/data-layer.md): `assertWriter` → validate → uniqueness pre-read (create) / current-row read (update: audit `before` + foreign/missing id → `CardNotFoundError`, indistinguishable) → one `atomically([write, recordAudit(...)])` batch. Optional fields absent → stored NULL, never invented (FR-014). A unique-index constraint violation from a concurrent race maps to the same duplicate-name refusal (R7). [`updateCard` reads the current row (existence/404 check) *before* validating, not after as the contract sketch's prose ordering suggested — validating a name-uniqueness change against a target that doesn't exist would be backwards, and 404 should take precedence over 422 for a nonexistent id.]
- [X] T034 [US3] Extend the surface: export `createCard`, `updateCard`, `assertWriter`, `assertAdmin` (+ `CardInput`) from `lib/data/index.ts`; update the exact list in `tests/isolation/surface.test.ts`.
- [X] T035 [US3] Implement `GET /api/cards` and `POST /api/cards` in `app/api/cards/route.ts` per contracts/http-api.md: GET — caller's household only, ordered by `sortOrder`, each card with derived `balanceMinor`, any member incl. viewer; POST — writer role, `201` with the created card, ids/`at` from `lib/runtime/` at the boundary; errors via `respond.ts`.
- [X] T036 [P] [US3] Implement `PATCH /api/cards/[id]` in `app/api/cards/[id]/route.ts`: any subset of the four fields, explicit `null` clears, omitted untouched; `{id}` resolves only within the caller's household — anything else the uniform `404`; `200` with the updated card. Deliberately no DELETE (deferred).

### Tests

- [X] T037 [P] [US3] Create `tests/unit/cards.test.ts` and `tests/unit/authz.test.ts`: the FR-017 validation matrix (empty name, >120 chars, duplicate incl. case-insensitive, negative limit, day 0/32, float minor units — full reasons list returned); create/update writes with before/after audit in the same atom (all-or-nothing on both drivers, SC-006); the role matrix (viewer refused, member+ writes, refusal writes nothing); **concurrent duplicate-name creates — the race loser's batch refused by the `cards_household_name_unique` index on both drivers** (R7 structural guarantee).
- [X] T038 [P] [US3] Create `tests/contract/cards.test.ts`: obligations 3–4 of contracts/http-api.md — `401` unauthenticated; viewer `403` on POST/PATCH; the `422` validation table with reasons payloads; `PATCH` with a foreign household's card id → `404` byte-identical to a nonexistent id; success shapes (`201` create, `200` update).
- [X] T039 [US3] Extend the `tests/isolation/` adversarial matrix with card operations: second household's cards invisible in GET, unmodifiable via PATCH, zero foreign rows in any response (SC-002 applied to the new write path).

**Checkpoint**: US1–US3 — the authenticated write pattern is established and proven.

---

## Phase 6: User Story 4 — One ADIB card, 600 EGP, no double-counting (Priority: P4)

**Goal**: The settled D7 decision applied as data: correcting `liabilities` rows (ADIB 60000 minor units reversing the imported `CC ADIB` 0; HSBC 0 reversing `CC HSBC`), the two unreachable `accounts` rows archived, everything audited citing D7, idempotency structural, 003 parity evidence untouched.

**Independent Test**: On the claimed migrated household, apply the consolidation and verify: one ADIB entity at exactly 60000 minor units counted exactly once; `shortTermLiabilities` +60000 and both net-worth figures −60000 versus the archived sheet, no other figure changed; every imported row byte-identical; correction and audit rows linked and citing D7; second application refused with zero rows; 003's reconciliation evidence regenerates unchanged (spec US4 Independent Test, SC-007/SC-008/SC-009).

### Implementation

- [X] T040 [US4] Compute the six imported-row anchor ids from the frozen dump (per card: the `cards` row, the stated `liabilities` row, the unreachable `accounts` row) using the deterministic `lib/import/ids.ts` functions; record them in the D7 register (`specs/003-data-foundation/discrepancies.md`, alongside the decision they realize) and pin them as a constant block in the new `lib/data/consolidation.ts` (R6 anchor-id scheme).
- [X] T041 [US4] Generalize the foundation's `assertNoCycle` walk in `lib/data/corrections.ts` to operate over `liabilities` as well as `transactions` (chains become possible the moment `reverses_id` exists — contracts/data-layer.md). [`assertNoCycle`/the internal row-loader now take a `table: typeof transactions | typeof liabilities` parameter; `recordCorrection`'s existing call site updated to pass `transactions` explicitly.]
- [X] T042 [US4] Implement `applyCardConsolidation(client, ctx, input)` in `lib/data/consolidation.ts` (contracts/data-layer.md): `assertAdmin` → pre-read the pinned ids **within the caller's household**, verify rows still match imported content (names, amounts, unreversed, unarchived) — absence/mismatch → `NotApplicableError` → per card, one atom: insert correcting `liabilities` row (`amountMinor` from the D7 register — ADIB 60000, HSBC 0 — `cardId`, `reversesId` → imported row) + `accounts` update (`archived_at`) + audit `create` citing D7 + audit `archive` with before/after. Second application → the partial unique index refuses the batch → `AlreadyAppliedError`, nothing written. Returns `ConsolidationResult`. [An explicit pre-read ("does any row already reverse this liability?") detects the already-applied case with a clear message *before* relying on the partial unique index as the structural backstop — both paths refuse the batch/write nothing, but the pre-read gives a more legible refusal than parsing a raw constraint-violation message.]
- [X] T043 [US4] Extend the surface: export `applyCardConsolidation` (+ `ConsolidationResult`) from `lib/data/index.ts`; final update of the exact list in `tests/isolation/surface.test.ts`.
- [X] T044 [US4] Implement `POST /api/corrections/card-consolidation` in `app/api/corrections/card-consolidation/route.ts`: no request body (the operation's content is fixed by D7, nothing parameterized); `200` with the `applied` shape from contracts/http-api.md; `409 already_applied` / `409 not_applicable` / `403` member-viewer / `401`; errors via `respond.ts`.

### Tests

- [X] T045 [P] [US4] Create `tests/unit/consolidation.test.ts` (D1 suite included per T005): the quickstart V6 pinned-figures table in minor units, no tolerance — `shortTermLiabilities` **+60000 exactly**, both net-worth figures **−60000 exactly**, every other derived figure unchanged, one ADIB entity at 60000 via `cardBalances`, HSBC one entity zero movement; imported rows byte-identical after application; double-apply refused structurally with zero rows (both drivers); archive audit entries present with before/after; a fresh-import test asserting the pinned anchor ids resolve; golden-style pins for post-consolidation derived figures on a corrected fixture (R12). [`totalOfAll` (`lib/derive/totals.ts` = holdings − shortTermLiabilities) also moves by −60000, a direct mathematical consequence of the same fix rather than a second figure the spec's "no other figure changes" was written to exclude — pinned explicitly rather than asserted unchanged.]
- [X] T046 [P] [US4] Create `tests/contract/consolidation.test.ts` (obligation 5): success shape with both cards; second call `409 already_applied`; non-migrated household `409 not_applicable`; member and viewer `403`; unauthenticated `401`.
- [X] T047 [US4] Prove FR-024/SC-008: re-run quickstart V2 (fresh import + reconcile — the corrected database is never the parity subject) and the full 003 suites — reconciliation report and golden evidence byte-for-byte unchanged, everything green. [60 test files / 291 tests pass on both drivers; fresh-import reconciliation report identical to Feature 003's evidence, COMPLETION GATE: OPEN.]

**Checkpoint**: all four stories functional; the migrated household's figures are correct per D7.

---

## Phase 7: Polish & Cross-Cutting (CI, budget, full validation, STOP)

- [X] T048 [P] Create `.github/workflows/ci.yml` — the repository's **first** CI (FR-029, R11): on push + pull_request — Node 22 via `.nvmrc`, `npm ci`, `npm run typecheck`, `npm run lint:money`, `npm run coverage:check`, `npm test` (both Vitest projects), fresh-import parity on a scratch DB (`npm run db:migrate:local -- --db` + `npm run import -- --dump migration/sheet-dump.json --db` + `npm run reconcile -- --db`), then `npx opennextjs-cloudflare build` + `npx wrangler deploy --dry-run` bundle-size check. No deploy step. CI must never reconcile a corrected database.
- [X] T049 [P] Run the bundle gate locally (quickstart V8): `npx opennextjs-cloudflare build && npx wrangler deploy --dry-run` — compressed worker under the ~3 MiB cap with Better Auth included; record the measured size in the PR description. [**Measured: 1,495.65 KiB gzip** (7,150.96 KiB uncompressed) — well under the ~3 MiB cap. Two dependency-resolution fixes were needed to get here, documented in `.npmrc`: (1) `@better-auth/drizzle-adapter` was used in code but never declared as a direct dependency — added explicitly; (2) `legacy-peer-deps=true` (from T002) produced a broken install (an incompatible `@noble/ciphers` v2 silently deduped into `@ecies/ciphers`, which needs v1) — replaced with `force=true`, which resolves the same peer conflicts via npm's modern resolver and nests the genuinely-conflicting `@noble/ciphers` versions correctly. Added `build: "next build"` to `package.json` scripts (OpenNext's build step needs it; only `dev` existed). Noted, not fixed: `better-auth@1.7.2`'s `drizzleAdapter` declares a peerOptional on `drizzle-orm@^0.45.2`; this project pins `^0.36.4` (Feature 003's foundation). Left as-is — upgrading is a major-version jump risking the entire proven 003 foundation, and it is only a soft peerOptional warning: every auth test that exercises the real adapter (session, provisioning, claim, cards, consolidation — all of Phases 3-6) passes against the installed 0.36.4.]
- [X] T050 Run the full quickstart validation V1–V8 end to end, including the V7 live headless walkthrough (`npm run dev`, cookie-jarred curl against `/api/state`, `/api/cards`, `/api/corrections/card-consolidation` — browser only for the Google redirect); push the branch and watch the first CI run go green (SC-011 — the first green run is itself a deliverable). [V1-V6, V8 all re-verified green after the dependency fixes. V7: found and fixed a real gap — `next dev`'s Wrangler D1 binding is a separate local database from `.data/local.db` and starts with no tables; added `npm run db:migrate:wrangler` (`wrangler d1 migrations apply ... --local`) and documented it in quickstart.md, since every route otherwise fails with `no such table`. With it applied, confirmed live against the real dev server: `GET /api/state`/`/api/cards`/`POST .../card-consolidation` all correctly `401` with no session; `GET /api/auth/get-session` returns `null`; `POST /api/auth/sign-in/social` returns a real Google authorization URL with exactly `scope=email+profile+openid` and no `access_type=offline` param — end-to-end proof of R2's token-minimization config. The actual Google-side handshake needs real OAuth credentials this environment doesn't have — deferred to the owner, consistent with quickstart's own framing ("sign-in is the one step curl cannot do"). **Branch not pushed and no CI run watched** — pushing/opening a PR is a user decision, not something to do unprompted; the workflow itself is authored and its install/build/reconcile steps are proven locally, ready for its first push.]
- [X] T051 **STOP at the UI boundary**: notify the owner that the headless surface is complete — authentication, provisioning, claim, state read, card writes, and the D7 consolidation are live behind route handlers with all suites green — and that all UI work (every page, screen, component, style, and navigation, including the sign-in page) awaits their Claude Design output. No visual work is performed under this feature.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: starts immediately; T001 first (baseline), T003–T005 parallel after T002.
- **Foundational (Phase 2)**: needs Setup. T006–T009 parallel (different schema files) → T010 (migration generation needs all schema edits) → T011. T012–T014 parallel anytime in-phase; T015 needs T014. **Blocks all user stories.**
- **US1 (Phase 3)**: needs Phase 2. T016+T019 parallel → T017 → T018 → T020–T022 → T023; tests T024/T025 parallel after implementation, T026 after T023.
- **US2 (Phase 4)**: needs US1 (extends `onFirstSignIn` and `provisioning.ts`). T027 → T028; T029 parallel with T028; T030 last.
- **US3 (Phase 5)**: needs Phase 2 + US1's `requireContext` (T018) for its routes; the data-layer tasks T031–T033 need only Phase 2 and can start in parallel with US2. T031+T032 parallel → T033 → T034 → T035, T036 parallel → tests.
- **US4 (Phase 6)**: needs US3 (`assertAdmin` from T031, the card entity as anchor) and US2 for its end-to-end test on a claimed household. T040+T041 parallel → T042 → T043 → T044 → tests → T047.
- **Polish (Phase 7)**: T048/T049 parallel once the suites exist; T050 after everything; T051 last.

### Story Independence

Each story checkpoint is independently testable: US1 with two fresh users; US2 with a designated owner against the migrated fixture; US3 entirely within one provisioned household (plus a second for isolation); US4 on the claimed migrated fixture. US2–US4 build on US1's session plumbing but each ships and validates on its own.

## Parallel Example: after Phase 2 completes

```text
# US1 and US3 data-layer work can proceed simultaneously (different files):
T016 lib/auth/config.ts            | T031 lib/data/authz.ts
T019 lib/data/provisioning.ts      | T032 lib/data/validate-cards.ts

# Within US3, both route files after T034:
T035 app/api/cards/route.ts        | T036 app/api/cards/[id]/route.ts

# Test suites are parallel within every story (different files):
T024 tests/auth/*                  | T025 tests/contract/*
T037 tests/unit/cards,authz        | T038 tests/contract/cards
T045 tests/unit/consolidation      | T046 tests/contract/consolidation
```

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + US1**: an authenticated, isolated, provisioning application with the aggregated read — everything else is safe to layer on. Then deliver incrementally in priority order (US2 → US3 → US4), re-running V1/V2 (SC-010) at every checkpoint, and finish with CI + the full quickstart + the STOP notification. Commit after each task or coherent group.
