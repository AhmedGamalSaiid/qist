# Research & Decisions: Multi-User Application

**Feature**: `004-multi-user-app` | **Date**: 2026-08-27 | **Spec**: [spec.md](spec.md)

Every unknown in the Technical Context resolves here. The constitution
(v2.0.0) fixes the stack outright — Next.js 16 App Router, Cloudflare Workers
via `@opennextjs/cloudflare`, Cloudflare D1 with Drizzle, Better Auth with
Google OAuth — so the research below is not "which framework" but "how each
fixed choice binds to the Feature 003 foundation without disturbing it."

---

## R1. Where Better Auth's tables live

**Decision**: Better Auth uses the Drizzle adapter over the same D1 database.
Its **user model maps onto the existing `users` table** (Feature 003 shaped it
Better-Auth-compatible on purpose: `id`, `email`, `name`, `image`). A migration
adds the two columns Better Auth requires that 003 omitted (`email_verified`,
`updated_at`). The three auth-plane tables it needs are created with explicit
non-default names — `auth_sessions`, `auth_accounts`, `auth_verifications` —
via Better Auth's model-name mapping.

**Rationale**:
- One user identity. Every domain FK (`transactions.created_by`,
  `rates.created_by`, `audit_log.actor_id`, `memberships.user_id`) already
  points at `users`. A second auth-owned user table would force a 1:1 bridge
  and two ids for one person — a standing invitation to join on the wrong one.
- The rename is not cosmetic: Better Auth's default `account` table would sit
  beside the domain's financial `accounts` table. Two near-identical names for
  an OAuth link row and a money-bearing row is exactly how a tired query joins
  the wrong table. The `auth_` prefix makes the plane split legible in every
  query, migration, and backup.
- Auth-plane tables carry **no `household_id`** — they belong to the identity
  plane, not the tenanted domain plane. Principle IX governs *domain* rows;
  sessions and OAuth links are keyed by user, and household scope is derived
  *from* them, never stored *on* them (see plan.md Constitution Check, IX).

**Alternatives considered**:
- *Separate Better Auth user table + link column on domain `users`*: rejected —
  two ids per person, and the importer's synthetic owner would need a fake auth
  row or a nullable link, both worse than one table.
- *Default Better Auth table names*: rejected for the `account`/`accounts`
  collision above.
- *Sessions in KV or cookie-only (JWT)*: rejected — the constitution says
  "sessions persisted in D1", and a server-revocable session is what makes
  FR-004 ("expired or revoked is indistinguishable from no session") testable.

**Implementation note**: generate the auth schema with Better Auth's CLI
(`npx @better-auth/cli generate`) against the configured model names, then
hand-fold the output into `db/schema/auth.ts` so Drizzle Kit owns the migration
(constitution: schema changes ship as migrations, never manual SQL). Verify the
field mapping against the installed Better Auth version at implementation time;
the mapping API (`modelName` / `fields`) is stable in the 1.x line.

## R2. Google OAuth is the only credential

**Decision**: Better Auth is configured with exactly one authentication method:
Google OAuth. Email/password, magic links, passkeys, and every other plugin
stay off.

**Rationale**: Constitution Principle III permits exactly one external identity
dependency — Google OAuth — and the application must never store a credential
(spec FR-001). Fewer flows means less auth-plane surface inside the ~2 MiB
worker budget, and no password table to protect.

**Provider tokens are not retained**: spec FR-001 says no credential is ever
stored, and an OAuth access/refresh token *is* a bearer credential. Sign-in
needs only the verified profile, which Better Auth consumes during the
exchange; the application never calls a Google API afterwards. Configuration:
minimal scopes (`openid email profile`), no offline access (so Google never
issues a refresh token), and a database hook nulls the token fields before
the `auth_accounts` row is persisted — the token columns exist because the
model requires them, but they hold NULL in every row (verified against the
installed Better Auth version at implementation time, same caveat as R1). If
a Google API use case ever appears (none is planned), retaining tokens
becomes a new decision, not a default.

**Alternatives considered**: adding email/password as a fallback — rejected;
it violates the constitution's single-external-identity posture and creates a
stored credential the spec forbids. Storing tokens "because the columns are
there" — rejected; FR-001 draws the line at stored credentials, and unused
short-lived tokens are still credentials.

## R3. How a session becomes an `Identity` and a `HouseholdContext`

**Decision**: a new `lib/auth/` module owns the binding, in two steps that
mirror the foundation's own two-stage scoping:

1. `sessionIdentity(request)` → verifies the Better Auth session cookie and
   returns the foundation's `Identity { userId }` — or `null`. This is the
   **only** producer of `Identity` in the application. Nothing else constructs
   one from request data.
2. The existing `householdContextFor(client, identity, householdId)` then
   builds the `HouseholdContext`, with the household chosen by resolving the
   session user's memberships (`householdsFor`) — **never** from anything the
   request supplies. With this feature's single-household reality: exactly one
   membership → that context; zero → first-visit provisioning (R4); more than
   one → explicit error (structurally possible, operationally impossible until
   membership management ships; failing loudly beats guessing).

Route handlers call one composed helper, `requireContext(request)`, which
returns `{ context, client }` or throws a typed unauthenticated/unauthorized
error. Handlers never see a raw user id from the wire.

**Rationale**: the foundation already enforces household scoping inside the
repositories and proves it with `tests/isolation/`. The one missing link was a
trustworthy `Identity` producer — Feature 003's callers all use
`ownerContextFor`, which bypasses identity checks and is documented as
CLI-only. Feature 004 supplies the producer and *keeps the seam*: no repository
signature changes, no second data-access path (spec FR-019).

**Alternatives considered**:
- *Passing `householdId` in the URL and checking membership*: rejected —
  Principle IX forbids scope from request parameters outright, and the
  spec (FR-006) restates it. Membership *verification* of a caller-chosen id
  is precisely the pattern the constitution calls a security defect.
- *Middleware-injected context on every request*: rejected — Next.js middleware
  runs on a separate runtime path under OpenNext and cannot hold the D1
  binding reliably; a per-handler helper is plainer and testable as a function.

## R4. First sign-in provisioning and the owner claim

**Decision**: a Better Auth user-creation hook pair — a **before-create
guard** (the fail-closed check below) and an **after-create** call of one
domain function, `onFirstSignIn` — branches on operator configuration:

- If the new user's verified email equals the operator-designated
  **`OWNER_EMAIL`** (a Wrangler environment variable/secret), run
  `claimMigratedHousehold`: in one atomic batch, repoint the migrated
  household's owner membership from the importer's synthetic placeholder user
  (`owner@household.local`) to the real user, and write an audit entry
  (action `update`, entity `memberships`, before/after captured). The
  placeholder `users` row **remains** — imported rows and the import audit
  entry reference it as historical fact (spec FR-011) — but it holds no
  membership afterward, and since it has no OAuth account and no credential
  exists anywhere, it was never an authentication target to begin with.
- Otherwise, run `provisionHousehold`: create household + owner membership +
  audit entry in one atomic batch (spec FR-005).

**Fail closed when the designation is missing**: if the database holds an
unclaimed migrated household (an owner membership still held by the
placeholder user) and `OWNER_EMAIL` is unset, first sign-ins are refused
outright (`OwnerUnconfiguredError`; the guard runs before user creation, so
nothing is persisted — no user, session, or household row). Rationale: the
spec's edge case demands the pre-configuration outcome be "explicit and
recoverable", never a silently provisioned duplicate household — and a
refused sign-in with a stated operator-configuration error is exactly that.
The cost is nil: the only deployment carrying an unclaimed migrated household
is the operator's own, and the guard is inert on every deployment without one
(`OWNER_EMAIL` is then irrelevant and provisioning proceeds normally).

A recovery path remains for the residual mis-designation edge (`OWNER_EMAIL`
was set to the *wrong* address, so the real owner signed in and was
provisioned an ordinary household): `npm run claim -- --email <owner>` runs
the same `claimMigratedHousehold` with an explicit precondition — the target
user's current household must contain no domain rows beyond its own
membership. If that holds, one audited atom repoints the migrated household's
owner membership to the real user **and parks the empty shell**: the shell
household's membership is repointed onto the placeholder user, so the
claimant keeps exactly one membership and the shell survives as an empty,
unreachable historical row. Nothing is deleted — the audit log's NOT NULL
household FK, its append-only discipline, and its fixed action set
(`create`/`update`/`archive`/`import`; no `delete`) make household deletion
structurally inexpressible, which is treated as a feature (see
[data-model.md](data-model.md), the parked-shell note). If the precondition
fails, the script refuses and a human decides.

**Rationale**: designation must be explicit operator configuration — the spec
forbids guessing ownership from data. The hook point guarantees FR-005's "on
first sign-in" without scattering ensure-provisioned checks across handlers.
The claim is naturally one-time: the hook fires only on user creation, and
`claimMigratedHousehold` is guarded by the membership's current holder being
the placeholder.

**Alternatives considered**:
- *Lazy provisioning on first data access*: rejected — makes "who has a
  household" request-order-dependent and turns every read path into a
  potential writer.
- *Auto-matching the importer's owner email*: rejected — the placeholder email
  is synthetic (`owner@household.local`); nothing real ever matches it, and
  fuzzy-matching a real email to a household is the guessing the spec forbids.
- *Deleting the placeholder user row*: rejected — FKs from imported
  transactions and the import audit entry must keep resolving; history is
  immutable.

## R5. Identifiers and timestamps for application writes

**Decision**: application-created rows use **`crypto.randomUUID()`**, and
timestamps use `Date.now()` — both captured **at the boundary** (route
handlers / auth hooks) by two tiny helpers in `lib/runtime/`, and passed into
`lib/` functions as explicit `id` / `at` parameters, exactly as the
foundation's write functions already demand.

**Rationale**: `crypto.randomUUID()` is native on Workers and Node 22 —
zero dependencies against a hard bundle budget. The foundation deliberately
keeps `lib/` clock-free and id-free (its `lint:money` even rejects `new Date()`
on monetary paths); keeping generation at the boundary preserves that
determinism and lets every test pin ids and times, as the 003 suites do.
Ordering never rides on id shape in this schema — `created_at`, `sort_order`,
and `at` carry it — so ULID's sortability buys nothing here.

**Alternatives considered**: a ULID library (adds a dependency for an ordering
property nothing reads); reusing `lib/import/ids.ts` (explicitly import-only —
content-hashed, collides on identical natural keys by design, and its own doc
comment forbids relying on it past cutover).

## R6. How the D7 consolidation is represented (the 600 EGP correction)

This is the load-bearing design decision of the feature. The migrated data
holds the one physical ADIB card as three unlinked rows:

| Row | Table | Imported value | Feeds derived figures? |
|---|---|---|---|
| `ADIB C.C` | `accounts` (kind `liability`) | 600.00 EGP | No — liabilities are excluded from holdings; the value is the "unreachable" `Data!D13` |
| `ADIB CC` | `cards` | no balance (cards carry none) | No |
| `CC ADIB` | `liabilities` | 0.00 EGP | Yes — summed into short-term liabilities |

So today the 600 is counted **zero** times, and D7's register records the
consequence: the sheet understates short-term liabilities by 600 EGP and
overstates both net-worth figures by 600 EGP.

**Decision**: extend the foundation's *existing* correction discipline to the
`liabilities` table, and make the card the anchor entity:

1. **Schema (migration, additive only)**: `liabilities` gains
   `card_id` (nullable, composite FK → `cards`) and `reverses_id` (nullable,
   composite self-FK, `CHECK` no-self-reversal, partial
   `UNIQUE(household_id, reverses_id) WHERE reverses_id IS NOT NULL`) —
   the exact shape `transactions` already has.
2. **The consolidation operation** (`applyCardConsolidation`, owner/admin
   only, one atomic batch per card):
   - ADIB: insert a **correcting `liabilities` row** — 600.00 EGP
     (60000 minor units), `card_id` → the ADIB card, `reverses_id` → the
     imported `CC ADIB` row — plus its audit entry citing D7; and **archive**
     the `accounts` row `ADIB C.C` (set `archived_at`, audit action
     `archive`), since the correcting row now represents the value the
     unreachable account row stored.
   - HSBC: identically — a correcting row of 0.00 EGP reversing `CC HSBC`,
     linked to the HSBC card, and archive `HSBC C.C`. One entity, no figure
     moves.
3. **Derivation**: `shortTermLiabilities` applies the same
   reversed-entry filtering the transaction rollup already uses (a row whose
   id is reversed by another row stops contributing; the correcting row
   contributes instead). A new derivation, `cardBalances`, computes each
   card's balance as the sum of its non-reversed linked liability rows —
   giving "one ADIB card entity, balance 600 EGP, counted exactly once."
4. **Idempotency is structural**: the partial unique index means a second
   consolidation attempt tries to reverse an already-reversed row and the
   batch is refused by the database, not by handler discipline (spec FR-023).

**Rationale**:
- No imported row is edited or deleted — spec FR-022/FR-024 and Principle II.
  The imported `CC ADIB` (0), `CC HSBC` (0), `ADIB C.C` (600, archived), and
  `HSBC C.C` rows all remain byte-identical; the historical labels stay
  discoverable (FR-025) through those rows and the audit trail.
- It reuses the correction grammar the foundation already proved
  (reverses-link, cycle rules, netting at read time) instead of inventing an
  alias table or a merge — there is deliberately no fuzzy-name machinery in
  this design, matching 003's refusal to merge on name similarity.
- Archiving (not deleting) the `accounts` liability rows uses a mechanism and
  audit action (`archive`) the foundation already defines.

**How the imported rows are resolved (the anchor ids)**: the dump is a
frozen artifact and the importer's ids are deterministic functions of it
(`lib/import/ids.ts` — valid for this migration precisely because the dump
is frozen and cutover is deferred; a fresh re-import reproduces the same
ids). At implementation time the six imported-row ids (per card: the `cards`
row, the stated `liabilities` row, the unreachable `accounts` row) are
computed once from the frozen dump, recorded in the D7 register alongside
the decision they realize, and pinned as a constant block in
`lib/data/consolidation.ts`. At run time `applyCardConsolidation` pre-reads
exactly those ids **within the caller's household** and verifies the rows
still match their imported content (names, amounts, unreversed, unarchived)
before writing; any absence or mismatch → `NotApplicableError`. Id-anchoring
makes the operation immune to card renames (cards are user-managed before
the consolidation may run; ids never change) and to re-imports
(deterministic ids); a fresh-import test asserts the pinned ids resolve.

**Effect on the parity evidence (why FR-024/SC-008 hold)**: `npm run
reconcile` compares a database against the dump and takes `--db`. The parity
proof is a function of *(dump, importer, derivations)*: importing the dump
into a **fresh** database and reconciling reproduces Feature 003's evidence
unchanged, because a fresh import contains no correction rows and the new
derivation filtering is the identity on data with no reversals (same reason
every 003 golden test still passes byte-for-byte). The application database,
which does carry the correction, is simply not the parity subject — and the
quickstart and CI pin reconciliation to a fresh import so nobody reconciles
the corrected DB by accident. D7's register already documents the intended
divergence in prose.

**Alternatives considered**:
- *Edit the `liabilities` row in place (0 → 600) with an audit entry*:
  rejected — in-place edit of an imported financial value, the exact thing
  the spec forbids (FR-022) and D7's register rules out ("never as an
  in-place edit").
- *A card-alias table mapping historical names to cards*: rejected — solves
  name resolution but not the balance correction, adds a table nothing else
  needs, and the three labels are already permanently linked through the
  correction row's FKs and the audit trail.
- *Recording the correction as a `transactions` row*: rejected — the 0 EGP
  error is not a transaction; it is a mis-stated liability balance, and
  short-term liabilities derive from `liabilities`, so a transaction row
  would never reach the figure it must fix.
- *A `card_payments`-based representation*: rejected — payments are future
  daily-action scope; conflating a balance correction with a payment invents
  a payment that never happened.

## R7. Card writes

**Decision**: `lib/data/cards.ts` adds `createCard(client, ctx, input)` and
`updateCard(client, ctx, input)`, following the foundation's one write
pattern — validate, read what the decision needs, then a single
`atomically([write, recordAudit(...)])` batch. Validation is hand-rolled in
`lib/data/validate-cards.ts` (name required/trimmed/≤ 120 chars, case-insensitive
uniqueness within the household — pre-read for the full reasons list, unique
index for the guarantee, below; `limit_minor` a non-negative
integer; `statement_day`/`due_day` integers 1–31; explicit `null` clears an
optional field on update). Updates read the current row first — both for the
audit `before` state and to refuse cross-household ids as not-found.

**Rationale**: `atomically` takes a statement array, never a callback (a hard
D1 constraint), so read-then-decide happens before the atom — the same shape
`recordCorrection` and `setBalanceMode` already use. Hand-rolled validation
keeps the dependency count where the bundle budget wants it, and the domain
rules (minor units, day clamping) need domain code regardless.

**Concurrency, made structural**: a uniqueness pre-read alone would leave a
race window (two simultaneous creates of the same name could both pass the
read) — and the spec allows no such window: FR-017 makes uniqueness a
validation rule and SC-005 demands refusal in 100% of the defined invalid
cases. So uniqueness is a database constraint: migration 0001 adds
`cards_household_name_unique` — `UNIQUE(household_id, lower(name))`
([data-model.md](data-model.md)). The pre-read stays for UX (it feeds the
full `reasons` list of the 422); the index is the integrity guarantee — a
race loser's batch is refused loudly by the database on both drivers, and
the constraint violation maps to the same duplicate-name refusal. This is
not the `NOT EXISTS`-guard shape rejected here previously: a constraint
violation rejects the whole batch with an error, never a silent no-op.
Imported data already satisfies the index (card names are distinct within
the household); the migration asserts that before creating it.

## R8. Authorization (roles)

**Decision**: role checks live **inside the data-layer write functions**, not
in handlers: `lib/data/authz.ts` provides `assertWriter(ctx)` (owner, admin,
member) and `assertAdmin(ctx)` (owner, admin), throwing a typed
`UnauthorizedRoleError`. `createCard`/`updateCard` call `assertWriter`;
`applyCardConsolidation` and future correction paths call `assertAdmin`;
repository reads require membership only (any role, viewer included).

**Rationale**: the same reasoning as household scoping — enforcement in the
data-access layer means a newly written handler *cannot forget it* (Principle
IX's structural argument applied to roles). `ctx.role` has been carried,
unchecked, since 003; this feature is where it starts meaning something.

## R9. The HTTP surface: route handlers, not server actions

**Decision**: the application exposes JSON **route handlers** under
`app/api/`:

- `app/api/auth/[...all]/route.ts` — the mounted Better Auth handler
  (sign-in, callback, sign-out, session).
- `GET /api/state` — the one aggregated read: the foundation's
  `loadHouseholdState`, extended to include cards (with derived balances) and
  card payments.
- `GET /api/cards`, `POST /api/cards`, `PATCH /api/cards/{id}`.
- `POST /api/corrections/card-consolidation` — the owner/admin D7 operation.

Error semantics are uniform: `401` for no/expired session; `403` only for
role refusals *within* the caller's own household; anything outside the
caller's household answers `404` **exactly as if it did not exist** (spec
FR-007 — a `403` would confirm existence); `422` for validation refusals with
a stated reason.

**Rationale**: route handlers are plain functions taking a `Request` — they
can be contract-tested headlessly under Vitest with no browser and no UI,
which is exactly the boundary this feature stops at. Server actions are
UI-coupled by design (invoked from components) and belong to the feature that
gets the owner's designs.

**Alternatives considered**: server actions now (rejected as above); a
separate API worker (rejected — the constitution says one deployment, route
handlers are the API).

## R10. Next.js/OpenNext scaffold now, deployment later

**Decision**: this feature adds the Next.js 16 application scaffold with
`@opennextjs/cloudflare` and a `wrangler.jsonc` whose D1 binding serves
**local development and tests** (`next dev` / `wrangler dev` / Miniflare).
Production deployment, custom domains, cron triggers, and backups stay
deferred, exactly as the spec's Deferred table says. The bundle-size gate
(`opennextjs-cloudflare build` + `wrangler deploy --dry-run`) runs in CI as a
standing check against the ~3 MiB Workers cap — the constitution measured a
stock scaffold at 977 KiB gzipped, leaving ~2 MiB for everything this feature
adds, Better Auth included.

**Rationale**: the app must exist and run locally to be tested at all, and
the D1 binding requires wrangler configuration even for dev; none of that is
a deployment. Checking the bundle from day one prevents discovering at
cutover that the budget was spent.

## R11. CI (FR-029)

**Decision**: one GitHub Actions workflow, `.github/workflows/ci.yml`,
running on pushes and pull requests: Node 22 (`.nvmrc`), `npm ci`,
`npm run typecheck`, `npm run lint:money`, `npm run coverage:check`,
`npm test` (both Vitest projects — better-sqlite3 and Miniflare D1), then
fresh-import parity (`npm run import` into a scratch DB + `npm run
reconcile -- --db` against it), and the OpenNext build with the dry-run
bundle-size check. No deploy step.

**Rationale**: this closes the honest gap the spec records (003's plan claimed
CI ran the dual-driver suites; no workflow ever existed). The reconcile step
runs against a fresh import per R6 — CI must never reconcile a corrected
database against the dump.

## R12. Testing strategy

**Decision**: extend the existing Vitest setup, same helpers, same dual-driver
projects:

- `tests/auth/` — session→identity binding, provisioning on first sign-in,
  the owner claim (hook path and recovery script path), placeholder
  retirement, session expiry semantics. Better Auth is exercised against the
  test database through its own API; Google's endpoints are not called —
  the OAuth dance is Better Auth's tested code, and our seam is the session
  and the after-create hook.
- `tests/contract/` — route handlers invoked as functions with constructed
  `Request`s: status codes, 404-indistinguishability, 401/403/422 semantics,
  JSON shapes per [contracts/http-api.md](contracts/http-api.md).
- `tests/unit/` additions — card validation and writes (audit before/after,
  atomicity), authz role matrix, consolidation (figures move exactly +600/−600,
  double-apply refused, imported rows byte-identical, archive audit entries).
- `tests/isolation/` additions — the adversarial cross-household matrix of
  spec SC-002 driven through the session-derived path, and the surface test
  updated for the new exported names.
- `tests/golden/` — **unchanged and required to stay green** (SC-010); plus
  new golden-style pins for post-consolidation derived figures on a corrected
  fixture.

The d1 (Miniflare) project picks up the new atomicity-sensitive suites
(consolidation, cards) since their refusal semantics come from D1 `batch()`.

The suites ship with their wiring, in the same change: `package.json` gains
`test:auth` and `test:contract` scripts (the existing
`scripts/vitest-runner.mjs` pattern), and `vitest.config.ts`'s `D1_SUITES`
list gains `tests/auth/**`, `tests/contract/**`, and the new
card/consolidation write suites. The quickstart's V4/V5 commands are these
scripts — they must exist by the time those gates run, so the script and
config edits are planned deliverables, not incidental setup.

**Rationale**: the foundation's proof style — pinned inputs, dual drivers,
structural assertions — is what made 003 trustworthy; 004 inherits it rather
than inventing a parallel style.

---

## Resolved-unknowns ledger

| Unknown | Resolution |
|---|---|
| Auth ↔ existing `users` table | R1 — one table, mapped; `auth_`-prefixed session/account/verification tables |
| Only credential | R2 — Google OAuth only; no provider token ever persisted (FR-001) |
| `Identity` producer | R3 — `sessionIdentity` in `lib/auth/`, sole producer; scope never from the request |
| Provisioning & claim | R4 — creation-hook pair; fail-closed when `OWNER_EMAIL` is unset while the migrated household is unclaimed; audited claim + parked-shell recovery script |
| Ids/timestamps | R5 — `crypto.randomUUID()` + `Date.now()` at the boundary only |
| 600 EGP representation | R6 — correction rows on `liabilities` with `reverses_id` + `card_id`; archive the unreachable account rows; pinned deterministic anchor ids; parity pinned to fresh import |
| Card write path | R7 — `createCard`/`updateCard`, validate → read → one atomic batch with audit; name uniqueness structural via `UNIQUE(household_id, lower(name))` |
| Roles | R8 — asserted inside data-layer writes |
| API shape | R9 — JSON route handlers; 404-indistinguishable cross-household semantics |
| Deployment boundary | R10 — scaffold + local dev + CI bundle check now; deploy/cutover deferred |
| CI | R11 — single workflow, full verification set, fresh-import reconcile |
| Test approach | R12 — extend existing suites and helpers, dual-driver; `test:auth`/`test:contract` scripts and `D1_SUITES` additions are planned deliverables |
