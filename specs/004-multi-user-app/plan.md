# Implementation Plan: Multi-User Application

**Feature directory**: `specs/004-multi-user-app` | **Date**: 2026-08-27 | **Spec**: [spec.md](spec.md)

**Branch**: work continues on the current branch; no `before_plan` git hook is
configured. Cutting `004-multi-user-app` from the landed 003 state is the
owner's call at implementation start.

**Input**: [spec.md](spec.md), the Feature 003 foundation
([specs/003-data-foundation/](../003-data-foundation/spec.md), authoritative
for everything it defines), and the D7 decision register
([discrepancies.md](../003-data-foundation/discrepancies.md)).

## Summary

Turn the verified data foundation into an authenticated multi-user
application service — headless by design, because every screen is deferred to
owner-supplied Claude Design output (a binding constraint, restated at every
artifact boundary).

Four deliveries, in dependency order:

1. **Real identity behind the existing seam.** Better Auth (Google-only)
   persists sessions in D1 and maps its user model onto the existing `users`
   table; a new `lib/auth/` module becomes the *sole* producer of the
   foundation's `Identity`, and household scope is derived from the session's
   memberships — never from anything a request supplies. The foundation's
   repositories, scoping, and isolation tests are reused unchanged.
2. **Provisioning and the claim.** First sign-in provisions a household
   (atomic, audited). The operator-designated owner's first sign-in instead
   claims the migrated household: the owner membership is repointed from the
   importer's synthetic placeholder, audited, one-time, with a guarded CLI
   recovery path (which parks — never deletes — a provably empty shell).
   While the migrated household is unclaimed and `OWNER_EMAIL` is unset,
   sign-in fails closed rather than provisioning a competing shell (R4).
3. **The first user-facing write path: cards.** `createCard`/`updateCard`
   extend the foundation's write discipline (validate → pre-read → one
   `atomically` batch with its audit statement), with role enforcement inside
   the data layer (`viewer` reads, `member`+ writes, `admin`+ corrects) and
   per-household card-name uniqueness as a database constraint, not a
   pre-read's promise (R7).
4. **The D7 consolidation, as data.** The `liabilities` table gains the
   correction grammar `transactions` already has (`reverses_id`) plus a
   `card_id` anchor; the settled decision — one ADIB card, 600.00 EGP, the
   0 EGP `CC ADIB` entry superseded — is applied as correction rows plus two
   audited archives, never as an edit to imported history. Idempotency is a
   database constraint, not handler discipline. The parity proof is untouched
   because it is a function of *(dump, importer, derivations)* reproduced on a
   fresh import, and the netting rule is the identity on data with no
   reversals.

Plus the infrastructure gap closed honestly: the repository's **first** CI
workflow (typecheck, money lint, coverage check, dual-driver suites,
fresh-import reconcile, bundle-size dry run).

All design decisions with rationale: [research.md](research.md). Schema
delta: [data-model.md](data-model.md). Surfaces:
[contracts/http-api.md](contracts/http-api.md),
[contracts/data-layer.md](contracts/data-layer.md). Validation:
[quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22+ (Wrangler 4 refuses
Node 20); Workers runtime for the application.

**Primary Dependencies**: Next.js 16 (App Router) via `@opennextjs/cloudflare`;
Better Auth (Drizzle adapter, Google provider only); Drizzle ORM/Kit;
`decimal.js` (existing, rate arithmetic only); Vitest + Miniflare (existing).
No other runtime dependency — validation is hand-rolled, ids are
`crypto.randomUUID()` (bundle budget, R5/R7).

**Storage**: Cloudflare D1 (SQLite), one database holding both planes:
`auth_`-prefixed identity-plane tables (no `household_id`) and the tenanted
domain plane (unchanged invariants). Local dev/tests: better-sqlite3 and
Miniflare D1, as in 003.

**Testing**: Vitest, the existing dual-driver projects extended with
`tests/auth/` and `tests/contract/` (route handlers invoked as plain
functions). Goldens and the reconciliation gate must stay green throughout
(SC-010); parity reconciles a fresh import only (R6).

**Target Platform**: Cloudflare Workers. This feature configures local dev
(wrangler config for the D1 binding) and CI builds; production deployment and
cutover remain deferred (spec, Deferred table).

**Project Type**: Web-service backend (headless) + library extensions + CLI
scripts. **No UI** — binding constraint; implementation stops at the UI
boundary and notifies the owner.

**Performance Goals**: modest and structural — initial state in one aggregated
read (`GET /api/state`); no derived value persisted; correctness dominates at
this scale (one real household, hundreds of rows).

**Constraints**: compressed worker ≤ ~3 MiB (free-plan cap; ~2 MiB headroom
after a stock scaffold — standing gate); integer minor units end-to-end; every
mutation atomic with its audit statement (`atomically` takes a statement
array — no interactive transactions on D1); scope from session only.

**Scale/Scope**: multi-tenant by construction; in practice one migrated
household plus fresh provisioned households. 29 functional requirements, 4
route groups, 1 additive migration, ~7 new data-layer functions.

## Constitution Check

*GATE: evaluated against constitution v2.0.0, Principles I–X.*

| Principle | Status | How this design satisfies it |
|---|---|---|
| **I. Database is single source of truth** | ✅ PASS | New derived values (`cardBalances`, netted `shortTermLiabilities`) are computed at read time, never stored. `GET /api/state` composes from base records per request. Sessions are canonical rows in D1, not duplicated client state; the cookie is a key, not a record. |
| **II. Ledger integrity is absolute** | ✅ PASS | All new writes go through the typed layer as single `atomically` batches containing their audit statements — provisioning, claim, card writes, consolidation each specified as one atom ([data-model.md](data-model.md), state table). The D7 correction is the principle's reversing-entry rule made real: `liabilities.reverses_id` mirrors `transactions` (no-self CHECK, once-only partial unique, cycle walk), imported rows stay byte-identical, and the incorrect 0 is superseded, not edited. Money stays integer minor units; the only new numeric inputs (card limit, days) are validated integers. |
| **III. Data stays under owner's control** | ✅ PASS | Google OAuth is the one external identity dependency the principle itself names, and the only one added. Sessions and OAuth link rows live in the owner's D1. No Google access/refresh token is retained: offline access is never requested and provider token fields are stripped before persistence (R2, spec FR-001). No analytics, no telemetry, no error-reporting service. Secrets (`GOOGLE_CLIENT_*`, `BETTER_AUTH_SECRET`, `OWNER_EMAIL`) are Wrangler env/secrets, never client-side, never committed. |
| **IV. Phone-first UX** | ➖ N/A | No UI in this feature (binding deferral). The ≤3-tap obligation transfers to the feature that implements the owner's designs; nothing here constrains it — the API is tap-count-neutral. |
| **V. Bilingual EN/AR with real RTL** | ➖ N/A (data posture kept) | No UI. The API returns names byte-exact (Arabic account names flow through JSON untouched — existing golden coverage); no string in this feature is user-facing copy. |
| **VI. Perceived speed is a product decision** | ✅ PASS (structural) | The one-aggregated-read contract is delivered as `GET /api/state` (the foundation's `loadHouseholdState`, extended with cards). Caching/optimistic-write obligations attach to the future UI; this feature keeps them satisfiable. |
| **VII. One visual language** | ➖ N/A | No UI; the colour grammar binds the owner's future designs, not this feature. |
| **VIII. Honest scope** | ✅ PASS | The spec separates existing/new/deferred explicitly; CI is stated as a gap being closed, not a facility that existed (003's plan overclaimed it; this plan corrects the record). The auth-column verification step is recorded honestly (R1) rather than papered over; card-name uniqueness is enforced structurally by a unique index rather than left as a documented race (R7); the recovery path parks the empty shell household instead of claiming a deletion the audit schema cannot express (R4, data-model.md). Deployment is scaffolded-not-shipped, and stated as such. |
| **IX. Tenant isolation is structural** | ✅ PASS | The missing piece — a trustworthy identity producer — is delivered *behind* the existing seam: `sessionIdentity` is the sole `Identity` source; scope comes from the session's memberships; no request field can influence it (contract-tested, including `404`-indistinguishability). Repository scoping, composite FKs, and the isolation suite continue unchanged. Role checks live inside data-layer writes, extending the "unsafe call is not expressible" property to authorization. **Auth-plane tables carry no `household_id` by design**: they are identity-plane rows keyed by user, from which household scope is *derived* — the principle governs domain rows, and the plane split (`auth_` prefix, no domain FKs into the auth plane) keeps the boundary structural. Recorded here as an interpretation, not a waiver: no domain row loses scoping. |
| **X. No cutover without proven parity** | ✅ PASS | Untouched and defended: parity remains defined over a fresh import of the dump; CI runs import→reconcile on a scratch database; the corrected application database is never the parity subject. The netting rule is the identity on reversal-free data, so 003's goldens and report reproduce byte-identically (verified by keeping those suites green, V1/V2). The D7 divergence from the sheet is deliberate, register-documented, and audit-recorded — the principle's "understand the discrepancy first" was completed in 003. |

**Result: no violations.** Complexity Tracking is empty.

**Re-evaluated after Phase 1 design (data-model, contracts, quickstart): unchanged, still passing.** The one judgment call — auth-plane tables without
`household_id` — is documented under IX above and in
[data-model.md](data-model.md); it takes nothing away from any domain row.

## Project Structure

### Documentation (this feature)

```text
specs/004-multi-user-app/
├── spec.md
├── plan.md                   # this file
├── research.md               # decisions R1–R12 with rationale
├── data-model.md             # schema delta (authoritative for the 0001 migration)
├── quickstart.md             # validation guide V1–V8 + the UI stop rule
├── checklists/requirements.md
├── contracts/
│   ├── http-api.md           # the entire reachable surface
│   └── data-layer.md         # lib additions and boundaries
└── tasks.md                  # /speckit-tasks output (not created by /speckit-plan)
```

### Source Code (repository root)

```text
app/                          # NEW — Next.js App Router (headless: API only)
├── api/
│   ├── auth/[...all]/route.ts        # mounted Better Auth handler
│   ├── state/route.ts                # GET aggregated read
│   ├── cards/route.ts                # GET, POST
│   ├── cards/[id]/route.ts           # PATCH
│   ├── corrections/card-consolidation/route.ts   # POST (admin)
│   └── _lib/respond.ts               # single error→HTTP mapping table
db/
├── schema/
│   ├── auth.ts               # NEW — auth_sessions / auth_accounts / auth_verifications
│   ├── tenancy.ts            # users: +email_verified, +updated_at
│   ├── ledger.ts             # cards: + UNIQUE(household_id, lower(name)) index
│   ├── holdings.ts           # liabilities: +card_id, +reverses_id (+CHECK, partial unique)
│   └── …                     # everything else untouched
├── migrations/
│   └── 0001_*.sql            # NEW — the one additive migration
lib/
├── auth/                     # NEW — Better Auth config, sessionIdentity, requireContext, onFirstSignIn
├── data/
│   ├── provisioning.ts       # NEW — provisionHousehold, claimMigratedHousehold
│   ├── authz.ts              # NEW — assertWriter, assertAdmin
│   ├── cards.ts              # NEW — createCard, updateCard
│   ├── validate-cards.ts     # NEW
│   ├── consolidation.ts      # NEW — applyCardConsolidation (D7)
│   ├── state.ts              # + cards, cardPayments, derived.cardBalances
│   └── index.ts              # surface extended (exact list re-pinned in surface test)
├── derive/
│   ├── totals.ts             # shortTermLiabilities: netting rule
│   ├── cards.ts              # NEW — cardBalances
│   └── types.ts              # LiabilityLike + reversesId/cardId; CardLike
├── runtime/                  # NEW — newId() (crypto.randomUUID), now() — boundary-only
scripts/
├── claim.ts                  # NEW — npm run claim (recovery path)
tests/
├── auth/                     # NEW
├── contract/                 # NEW
├── unit/                     # + cards, authz, consolidation, provisioning/claim
├── isolation/                # + session-derived adversarial matrix; surface list updated
├── golden/                   # unchanged, must stay green
.github/workflows/ci.yml      # NEW — first CI (FR-029)
package.json                  # + test:auth / test:contract scripts (R12)
vitest.config.ts              # D1_SUITES + tests/auth, tests/contract, card/consolidation write suites (R12)
next.config.ts, open-next.config.ts, wrangler.jsonc, .dev.vars.example   # NEW — scaffold + local D1 binding
```

**Structure Decision**: single Next.js project at the repository root wrapping
the existing `db/` + `lib/` foundation in place — no `src/` move, no monorepo
split, no separate API package. The foundation's import paths, scripts, and
tests keep working unmodified; the app directory is additive. There is no
`frontend/` because there is deliberately no frontend yet.

## The UI boundary (restated for /speckit-tasks)

Tasks generated from this plan MUST NOT include designing or implementing any
page, screen, layout, component, styling, color, typography, or navigation —
including a styled sign-in page. The implementation surface ends at route
handlers, library code, migration, scripts, tests, and CI. The task list should
end with an explicit STOP task: notify the owner that the headless surface is
complete and UI work awaits their Claude Design output.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

*(empty — no violations)*
