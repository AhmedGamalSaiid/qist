# Contract: Data-Layer Additions

**Feature**: `004-multi-user-app` | **Date**: 2026-08-27

Feature 003's exported surface (`lib/data/index.ts`) is 12 names, asserted
verbatim by `tests/isolation/surface.test.ts`. Feature 004 **extends** that
surface — it never bypasses it, never exports a Drizzle table, never accepts a
`householdId` parameter on a repository method, and never adds a second
data-access architecture. The surface test is updated to the new exact list;
its structural assertions (no `export * from`, no driver imports, no
`householdId:` parameters in repositories) continue to hold.

Conventions carried from 003, binding on every function below: caller-supplied
`id` and `at` (R5 — generated at the boundary, never inside `lib/`); every
mutation is one `atomically([...])` batch containing its `recordAudit`
statement; reads needed for a decision happen *before* the atom and the
decision is encoded conditionally (D1 has no interactive transactions).

## New module: `lib/auth/`

The only bridge between Better Auth and the domain. Nothing else in `lib/`
imports Better Auth.

```ts
/** The sole producer of Identity in the application (spec FR-006). */
sessionIdentity(request: Request, client: AppClient): Promise<Identity | null>

/** Session → single unambiguous HouseholdContext.
 *  0 memberships → NoHouseholdError (provisioning is the auth hook's job,
 *  never a read path's side effect); >1 → MultipleHouseholdsError (loud,
 *  not a guess). */
requireContext(request: Request, client: AppClient): Promise<HouseholdContext>
  // throws UnauthenticatedError | NoHouseholdError | MultipleHouseholdsError

/** Better Auth user-creation hook body (R4): claims when the verified
 *  email matches the operator-designated owner, provisions otherwise.
 *  Fail-closed guard (runs BEFORE user creation): if an unclaimed migrated
 *  household exists (an owner membership still held by the placeholder
 *  user) and ownerEmail is null → OwnerUnconfiguredError, nothing
 *  persisted — no user, session, or household row (spec edge case: the
 *  outcome must be explicit, never a silently provisioned shell). Inert on
 *  deployments with no unclaimed migrated household. */
onFirstSignIn(client, input: {
  userId: string; email: string; emailVerified: boolean;
  ownerEmail: string | null;                 // from env, may be unset
  ids: { householdId: string; membershipId: string; auditId: string };
  at: number;
}): Promise<'provisioned' | 'claimed'>
```

`lib/auth/` also owns the Better Auth instance configuration (Google-only,
Drizzle adapter, `auth_`-prefixed model names, hook wiring) as
`createAuth(client, env)` consumed by the mounted route handler.

## New: `lib/data/provisioning.ts`

```ts
/** households + memberships(owner) + audit('create','household') in one atom.
 *  Idempotent per user: refuses (ProvisioningConflictError) if the user
 *  already holds any membership. */
provisionHousehold(client, input: {
  userId: string; householdName: string;
  ids: { householdId; membershipId; auditId }; at: number;
}): Promise<void>

/** Repoints the migrated household's owner membership from the importer's
 *  placeholder user to `newOwnerUserId`, with audit('update','memberships',
 *  before/after). Guarded: current holder must be the placeholder — which is
 *  what makes the claim one-time (second attempt: ClaimAlreadyMadeError,
 *  nothing written). recoverEmptyShell: additionally PARKS the claimant's
 *  auto-provisioned household IFF it contains no domain rows beyond its own
 *  membership — that membership is repointed onto the placeholder user in
 *  the same atom, audited on the shell household (shellAuditId); refuses
 *  otherwise. Nothing is deleted: the audit log's NOT NULL household FK,
 *  append-only discipline, and fixed action set make household deletion
 *  structurally inexpressible (data-model.md, parked-shell note). */
claimMigratedHousehold(client, input: {
  migratedHouseholdId: string; newOwnerUserId: string;
  recoverEmptyShell?: boolean;
  ids: { auditId: string; shellAuditId?: string }; at: number;
}): Promise<void>
```

CLI recovery: `npm run claim -- --email <owner> [--db <path>]`
(`scripts/claim.ts`) — same function, explicit preconditions, exits non-zero
with the reason when it refuses.

## New: `lib/data/authz.ts`

```ts
type WriterRole = 'owner' | 'admin' | 'member'
assertWriter(ctx: HouseholdContext): void   // throws UnauthorizedRoleError
assertAdmin(ctx: HouseholdContext): void    // owner | admin
```

Called at the **top of the data-layer write functions** they guard — not in
route handlers — so an unguarded write is not expressible through the exported
surface (R8). Reads require membership only; `viewer` reads everything in its
household.

## New: `lib/data/cards.ts`

```ts
interface CardInput {
  name: string
  limitMinor?: number | null      // null clears (update only)
  statementDay?: number | null    // 1–31
  dueDay?: number | null          // 1–31
}

/** assertWriter → validate → uniqueness pre-read →
 *  atomically([insert cards, audit('create','cards')]).
 *  Optional fields absent → stored NULL; never invented. */
createCard(client, ctx, input: CardInput & { id: string; auditId: string; at: number }): Promise<void>

/** assertWriter → validate changed fields → read current row
 *  (household-scoped; missing/foreign → CardNotFoundError, indistinguishable) →
 *  atomically([update cards WHERE (household_id,id), audit('update','cards',
 *  before/after)]). */
updateCard(client, ctx, input: Partial<CardInput> & { cardId: string; auditId: string; at: number }): Promise<void>
```

Validation lives in `lib/data/validate-cards.ts`, returns the full reasons
list (never first-failure-only) for the API's `422` payload. Rules per spec
FR-017; name uniqueness is case-insensitive within the household — the
pre-read feeds the reasons list, and the `UNIQUE(household_id, lower(name))`
index (data-model.md, migration 0001) is the structural guarantee: a
concurrent race loser's batch fails on the constraint, on both drivers, and
maps to the same duplicate-name refusal (R7). Refusal in 100% of cases is a
database property, not handler discipline.

## New: `lib/data/consolidation.ts` — the D7 operation

```ts
/** assertAdmin. Resolves the imported ADIB/HSBC triplets by their PINNED
 *  ANCHOR IDS: the importer's ids are deterministic functions of the frozen
 *  dump (lib/import/ids.ts — valid while the dump is frozen; cutover is
 *  deferred), so the six imported-row ids are computed once at
 *  implementation time, recorded in the D7 register, and held as a constant
 *  block in this module (R6). Pre-reads those ids WITHIN the caller's
 *  household and verifies the rows still match their imported content
 *  (names, amounts, unreversed, unarchived) before writing; absence or
 *  mismatch → NotApplicableError — inert on every household except the
 *  migrated one, immune to card renames (ids never change), stable across
 *  fresh re-imports (deterministic ids). A fresh-import test asserts the
 *  pinned ids resolve.
 *  Per card, one atom:
 *    insert liabilities { amountMinor, cardId, reversesId → imported row }
 *    + update accounts SET archived_at (the unreachable stated row)
 *    + audit('create','liabilities', citing D7)
 *    + audit('archive','accounts', before/after).
 *  ADIB amountMinor = 60000 — sourced from the D7 register's
 *  authoritative_minor, the settled decision input (spec FR-020/FR-021).
 *  Already applied → AlreadyAppliedError (partial unique index refuses the
 *  batch; nothing written). No applicable rows → NotApplicableError. */
applyCardConsolidation(client, ctx, input: {
  ids: { adibLiabilityId; adibAuditId; adibArchiveAuditId;
         hsbcLiabilityId; hsbcAuditId; hsbcArchiveAuditId };
  at: number;
}): Promise<ConsolidationResult>
```

Cycle protection reuses the foundation's `assertNoCycle` walk, generalized
over the table (chains on `liabilities` become possible the moment
`reverses_id` exists, whether or not this feature creates any).

## Changed: derivations (`lib/derive/`)

```ts
// totals.ts — netting applied; identity on data with no reversals,
// so every 003 golden figure is unchanged.
shortTermLiabilities(liabilities: LiabilityLike[]): EgpMinor

// types.ts — LiabilityLike gains: reversesId: string | null; cardId: string | null
// cards.ts (new) — derived, never stored:
cardBalances(cards: CardLike[], liabilities: LiabilityLike[]): CardBalance[]
  // balance = Σ non-reversed linked liability rows; cards with no linked
  // rows have balance 0 (imported cards before consolidation).
type CardLike = { id; name; limitMinor; statementDay; dueDay; sortOrder }
```

## Changed: `lib/data/state.ts`

`loadHouseholdState` adds `cards` and `cardPayments` to its parallel batch and
`derived.cardBalances` to the derived block (spec FR-010). Everything else in
`HouseholdState` is unchanged — existing consumers and goldens are untouched.

## Exported-surface delta (`lib/data/index.ts`)

Added to the exact-list surface test: `createCard`, `updateCard`,
`provisionHousehold`, `claimMigratedHousehold`, `applyCardConsolidation`,
`assertWriter`, `assertAdmin` (+ types `CardInput`, `ConsolidationResult`).
`lib/auth/` is a separate module with its own boundary: it may import
`lib/data/`; `lib/data/` never imports `lib/auth/` (the domain layer stays
auth-agnostic — it sees only `Identity`/`HouseholdContext`, exactly as 003
designed).

## New error types (`lib/errors.ts` additions)

`UnauthenticatedError`, `NoHouseholdError`, `MultipleHouseholdsError`,
`UnauthorizedRoleError`, `OwnerUnconfiguredError`, `CardNotFoundError`,
`CardValidationError(reasons)`, `ProvisioningConflictError`,
`ClaimAlreadyMadeError`, `AlreadyAppliedError`, `NotApplicableError`. Route handlers map them to the uniform HTTP semantics
in [http-api.md](http-api.md); the mapping table lives in one place
(`app/api/_lib/respond.ts`), not per-handler.
