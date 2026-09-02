# Data Model: Multi-User Application

**Feature**: `004-multi-user-app` | **Date**: 2026-08-27

**Scope of this document**: the **delta** Feature 004 makes to the schema.
[specs/003-data-foundation/data-model.md](../003-data-foundation/data-model.md)
remains the authoritative definition of every existing table; nothing there is
redefined here. All changes below ship as one additive Drizzle migration
(`0001_*`), forward-only, destroying nothing.

## Design invariants carried forward (unchanged)

- Every **domain** table: `household_id TEXT NOT NULL`, indexed,
  `UNIQUE(household_id, id)`, composite FKs `(household_id, id)`.
- Money: integer minor units. Timestamps: epoch milliseconds (integers).
  Dates: `YYYY-MM-DD` strings.
- Historical rows immutable; corrections are linked new rows; audit rows are
  append-only.

## Plane split

Feature 004 introduces the **identity plane**: tables owned by Better Auth
that carry **no `household_id`**. They are keyed by user, and household scope
is *derived from* them at context construction — never stored on them. The
`auth_` prefix marks the plane in every name (and keeps Better Auth's
`account` model from colliding with the domain's financial `accounts` table —
see [research.md R1](research.md)).

```text
identity plane:  users ── auth_accounts / auth_sessions / auth_verifications
                   │
                   └── memberships ──→ households        (the bridge)
                                          │
domain plane:                             └── every financial table (003)
```

`users` and `memberships` already exist (003) and remain the bridge between
planes; `users` doubles as Better Auth's user model.

## Changed table: `users` (additive columns)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `email_verified` | INTEGER | NOT NULL DEFAULT 0 | Better Auth requirement; 0/1. The importer's placeholder user stays 0 forever. |
| `updated_at` | INTEGER | NOT NULL DEFAULT 0 | Epoch ms; Better Auth maintains it. Backfilled to `created_at` for existing rows by the migration. |

Existing columns (`id`, `email` unique, `name`, `image`, `created_at`) are
untouched and map directly onto Better Auth's user model fields.

## New table: `auth_sessions` (identity plane)

Better Auth's session model, persisted in D1 per the constitution.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `user_id` | TEXT | NOT NULL, FK → `users.id` |
| `token` | TEXT | NOT NULL, UNIQUE |
| `expires_at` | INTEGER | NOT NULL (epoch ms) |
| `ip_address` | TEXT | NULL |
| `user_agent` | TEXT | NULL |
| `created_at` | INTEGER | NOT NULL |
| `updated_at` | INTEGER | NOT NULL |

Index: `(user_id)`, `(token)`.

## New table: `auth_accounts` (identity plane)

The OAuth provider link (Google). One row per user in practice.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `user_id` | TEXT | NOT NULL, FK → `users.id` |
| `provider_id` | TEXT | NOT NULL (`'google'`) |
| `account_id` | TEXT | NOT NULL (Google's stable subject id) |
| `access_token` / `refresh_token` / `id_token` | TEXT | NULL |
| `access_token_expires_at` / `refresh_token_expires_at` | INTEGER | NULL |
| `scope` | TEXT | NULL |
| `created_at` / `updated_at` | INTEGER | NOT NULL |

Constraints: UNIQUE `(provider_id, account_id)`; index `(user_id)`.

Identity continuity is by `(provider_id, account_id)` — a Google profile
rename or picture change updates `users.name`/`users.image` and never creates
a second user (spec edge case). The placeholder user has **no** row here,
which is what makes it structurally unauthenticatable (spec FR-011).

**Token minimization (spec FR-001)**: sign-in is the only Google use — the
application never calls a Google API after the profile exchange. The Better
Auth configuration never requests offline access (so Google issues no
refresh token) and a database hook nulls `access_token` / `refresh_token` /
`id_token` before the account row is persisted. The token columns exist
because the model requires them; they hold NULL in every row ([research.md
R2](research.md)). Verified against the installed Better Auth version at
implementation time (same caveat as the note below).

## New table: `auth_verifications` (identity plane)

Better Auth's verification-token store (OAuth state, etc.).

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `identifier` | TEXT | NOT NULL |
| `value` | TEXT | NOT NULL |
| `expires_at` | INTEGER | NOT NULL |
| `created_at` / `updated_at` | INTEGER | NOT NULL |

Index: `(identifier)`.

**Note**: exact auth-plane column lists are validated against the installed
Better Auth version's generator output at implementation time (R1); any
divergence is folded into the same migration before it ships. The names,
the plane split, and the no-`household_id` rule are fixed regardless.

## Changed table: `liabilities` (additive columns — the correction grammar)

`liabilities` gains the same correction shape `transactions` has, plus the
card link that makes a card the anchor entity of a consolidated balance:

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `card_id` | TEXT | NULL; composite FK `(household_id, card_id)` → `cards(household_id, id)` | Links a liability row to the card whose balance it states. NULL for every imported row and for non-card liabilities. |
| `reverses_id` | TEXT | NULL; composite self-FK `(household_id, reverses_id)` → `liabilities(household_id, id)` | A correcting row points at the row it supersedes. NULL for every imported row. |

New constraints (mirroring `transactions` exactly):

- `CHECK (reverses_id IS NULL OR reverses_id != id)` — no self-reversal.
- Partial `UNIQUE (household_id, reverses_id) WHERE reverses_id IS NOT NULL`
  — a row may be reversed only once. **This is what makes the D7
  consolidation impossible to apply twice** (spec FR-023): the second attempt
  is refused by the database, not by handler discipline.
- Cycle prevention for chains longer than one hop lives in the write path
  (`applyCardConsolidation` / any future liability correction), reusing the
  foundation's `assertNoCycle` walk — a SQLite CHECK cannot follow a FK.

**Read-time netting rule** (derivation change, not schema): a liability row
whose `id` appears as another row's `reverses_id` stops contributing to
`shortTermLiabilities`; the correcting row contributes instead. On any
database with no reversals — every fresh import of the dump — the rule is the
identity function, which is why all 003 golden figures and the reconciliation
report are unchanged (spec FR-024, SC-008).

**Card balance** (new derivation, nothing stored): a card's balance is the
sum of non-reversed `liabilities` rows with `card_id = card.id`. After the D7
consolidation the ADIB card's balance is exactly 60000 minor units (600.00
EGP), contributed exactly once to short-term liabilities.

## Changed table: `cards` (new unique index, no new columns)

The card write path (create/update) uses the existing column shape: `name`,
nullable `limit_minor` / `statement_day` / `due_day`, `sort_order`,
`created_at`. One constraint is added:

| Constraint | Definition |
|---|---|
| `cards_household_name_unique` | `UNIQUE (household_id, lower(name))` — expression index, part of migration 0001 |

Per-household case-insensitive name uniqueness is **structural** (spec
FR-017 / SC-005): the write path's pre-read supplies the full `422` reasons
list, and this index guarantees refusal even under concurrent writes — a
race loser's batch is refused by the database on both drivers and maps to
the same duplicate-name refusal ([research.md R7](research.md)). The
migration asserts existing rows already satisfy the index before creating it
(imported card names are distinct within the household); if Drizzle Kit's
generator cannot express the `lower(name)` expression index, the statement
is hand-folded into the generated 0001 SQL — the same discipline R1 applies
to the auth tables.

## Unchanged tables (deliberately)

- **`memberships`** — unchanged. The claim repoints the migrated household's
  owner membership `user_id` (an audited domain write); `UNIQUE(household_id,
  user_id)` already guards it.
- **`invitations`** — untouched scaffolding; membership management stays
  deferred.
- **`transactions`, `installments`, `card_payments`, `income_settings`,
  `accounts`, `property_holdings`, `rates`, `snapshots`, `audit_log`,
  `households`** — untouched. The consolidation *archives* two `accounts`
  rows via the existing `archived_at` column and `archive` audit action; no
  schema change involved.

## State written by this feature (rows, not columns)

| Event | Rows written (one atomic batch each) |
|---|---|
| First sign-in (ordinary user) | `households` + `memberships` (role `owner`) + `audit_log` (`create`, entity `household`) |
| First sign-in (designated owner) / recovery claim | `memberships` update (placeholder → real user) + `audit_log` (`update`, entity `memberships`, before/after, anchored to the migrated household). The recovery path additionally **parks** the claimant's provably empty shell household in the same atom: its membership is repointed onto the placeholder user + `audit_log` (`update`, entity `memberships`, before/after, anchored to the shell household). Nothing is deleted — see the note below. |
| First sign-in while `OWNER_EMAIL` is unset and the migrated household is unclaimed | **nothing** — the sign-in fails closed before user creation ([research.md R4](research.md)); no user, session, household, or audit row |
| Card create | `cards` insert + `audit_log` (`create`, entity `cards`, after) |
| Card update | `cards` update + `audit_log` (`update`, entity `cards`, before/after) |
| D7 consolidation (per card) | `liabilities` insert (correcting row) + `accounts` update (`archived_at`) + two `audit_log` rows (`create` citing D7; `archive`) |

Every audit row: actor = the session user (`actor_kind 'user'`), ids from
`crypto.randomUUID()`, `at` captured at the boundary (R5).

**Why the recovery shell is parked, not deleted**: `audit_log.household_id`
is `NOT NULL` with an FK to `households.id`, the audit trail is append-only
(no update/delete path exists in `lib/data/`), and the audit `action` set is
CHECK-constrained to `create` / `update` / `archive` / `import` — there is
no `delete` action. Deleting the shell household would orphan its own
provisioning audit row; deletion is structurally inexpressible, and that is
treated as a feature, not a limitation. The recovery therefore repoints the
shell's owner membership onto the importer's placeholder user
(unauthenticatable, FR-011): the claimant keeps exactly one membership, and
the shell household survives as an empty, member-unreachable historical row
— the same treatment R4 gives the placeholder user itself. Both audit
entries keep a valid `household_id` anchor forever: the claim entry on the
migrated household, the parking entry on the (retained) shell household.

## Entity → spec traceability

| Spec entity | Realization |
|---|---|
| User | `users` (+ Better Auth columns) |
| Session | `auth_sessions` |
| Household / Membership | existing `households` / `memberships`, now provisioned and claimed |
| Card | existing `cards` + new write path; balance derived via `liabilities.card_id` |
| Financial correction | `liabilities.reverses_id` rows (extending the `transactions` grammar) |
| Audit record | existing `audit_log`, now also covering provisioning, claim, card writes, consolidation |
