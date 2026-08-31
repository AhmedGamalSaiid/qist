# Contract: HTTP API Surface

**Feature**: `004-multi-user-app` | **Date**: 2026-08-27

The application's server surface. Every route is a Next.js route handler — a
plain function over `Request`/`Response` — so this contract is testable
headlessly (`tests/contract/`) with no UI. This is the **entire** externally
reachable surface Feature 004 ships; anything not listed does not exist yet.

## Universal semantics

| Concern | Rule |
|---|---|
| Identity | Derived exclusively from the Better Auth session cookie via `sessionIdentity` → `requireContext`. No route reads a user id or household id from path, query, body, or header — such fields do not exist in any request schema below. |
| No session / expired / revoked | `401` with `{ "error": "unauthenticated" }`. Indistinguishable across the three causes. |
| Outside the caller's household | `404` with `{ "error": "not_found" }` — byte-identical to a genuinely nonexistent id (spec FR-007; a `403` would confirm existence). |
| Role refusal inside own household | `403` with `{ "error": "forbidden", "requires": "<writer\|admin>" }`. |
| Validation refusal | `422` with `{ "error": "invalid", "reasons": [{ "field", "message" }] }`. Nothing written. |
| Money | Integer minor units in every request and response (`*_minor` fields). Non-integers are a `422`. |
| Success envelope | `200` (reads/updates) or `201` (creates) with the JSON shapes below. No derived value is ever persisted server-side to produce them. |

## Auth (mounted, library-owned)

```
ALL /api/auth/[...all]
```

The Better Auth handler: Google sign-in initiation, OAuth callback, session
read, sign-out. Configured with Google as the only provider (R2) and the
user-creation hook pair — the fail-closed guard before creation, the
provision-or-claim call after it (R4). Its internal routes are
Better Auth's contract, not restated here; our contract points are:

- A completed first sign-in leaves the user with exactly one household
  membership (provisioned, or the claimed migrated household).
- On a deployment holding an unclaimed migrated household with `OWNER_EMAIL`
  unset, first sign-in **fails closed**: refused as an operator-configuration
  error before user creation — no user, session, or household row is
  persisted (research.md R4). Deployments without an unclaimed migrated
  household are unaffected.
- No Google access/refresh/id token is retained: no offline access is
  requested and provider token fields are stripped before the account row is
  persisted (spec FR-001, research.md R2).
- Sign-out invalidates the server-side session row; subsequent calls are `401`.

## `GET /api/state` — the aggregated read

The constitution's one-round-trip read (Principle VI), serving spec FR-010.
Response is the foundation's `HouseholdState` extended with cards:

```jsonc
{
  "householdId": "…",
  "timezone": "Africa/Cairo",
  "today": "2026-08-27",
  "role": "owner",                       // the caller's role in this household
  "accounts": [ /* non-archived accounts */ ],
  "propertyHoldings": [ … ],
  "liabilities": [ /* rows + reversesId/cardId; reversed rows included, flagged */ ],
  "installments": [ … ],
  "transactions": [ /* + egpMinor via pinned rate */ ],
  "rates": [ … ],
  "snapshots": [ … ],
  "cards": [ { "id", "name", "limitMinor", "statementDay", "dueDay",
               "balanceMinor" /* derived, see cardBalances */ } ],
  "cardPayments": [ … ],
  "derived": {
    "totalHoldings": { … }, "investmentHoldings": { … },
    "liquidTotal": 0, "shortTermLiabilities": 0, "totalOfAll": 0,
    "investmentTotal": 0, "netWorth": { … }, "installmentSummary": { … },
    "unpaidByYear": [ … ], "assetMix": [ … ], "monthlyRollup": [ … ],
    "cardBalances": [ { "cardId", "balanceMinor" } ]
  }
}
```

Field shapes for everything except `cards`/`cardPayments`/`cardBalances`/`role`
are exactly `loadHouseholdState`'s existing output — see
[contracts/data-layer.md](data-layer.md). `derived.shortTermLiabilities`
applies reversed-entry netting (data-model.md).

## Cards

### `GET /api/cards`

`200` → `{ "cards": [ { "id", "name", "limitMinor", "statementDay", "dueDay", "sortOrder", "createdAt", "balanceMinor" } ] }`
— the caller's household only, ordered by `sortOrder`. Any authenticated
member (viewer included).

### `POST /api/cards` — requires writer role

Request:

```jsonc
{
  "name": "string, required",
  "limitMinor": 123400,     // optional; omitted = unset
  "statementDay": 15,       // optional; 1–31
  "dueDay": 5               // optional; 1–31
}
```

Validation (spec FR-017): `name` required, non-empty after trim, ≤ 120 chars,
case-insensitively unique within the household; `limitMinor` a non-negative
integer; `statementDay`/`dueDay` integers 1–31. Days 29–31 are *interpreted*
by clamping in shorter months at derivation time — storage keeps the entered
value. Duplicate names are refused in 100% of cases *including concurrent
submissions*: uniqueness is a database constraint
(`UNIQUE(household_id, lower(name))`, data-model.md), so a race loser's
batch is refused by the database and answered with the same `422`.

`201` → the created card object. Atomically audited (`create`, before absent).

### `PATCH /api/cards/{id}` — requires writer role

Request: any subset of the same four fields; explicit `null` clears an
optional field (`"limitMinor": null`); omitted fields are untouched. Same
validation per field. `{id}` resolves only within the caller's household —
anything else is the uniform `404`.

`200` → the updated card object. Atomically audited (`update`, before/after).

There is deliberately no `DELETE` — card archival/deletion is deferred
(spec, Deferred table).

## `POST /api/corrections/card-consolidation` — requires admin role (owner/admin)

Executes the settled D7/HSBC consolidation on the caller's household
(research.md R6). Takes **no body** — the operation's content is fixed by the
D7 decision register, not by caller input; nothing about it is parameterized.
Row resolution is by the pinned imported-row anchor ids (deterministic
functions of the frozen dump — see [data-layer.md](data-layer.md)), verified
against the caller's own household before anything is written.

- `200` →

```jsonc
{
  "applied": [
    { "card": "ADIB", "correctingLiabilityId": "…", "amountMinor": 60000,
      "reverses": "<imported CC ADIB row id>", "archivedAccountId": "…" },
    { "card": "HSBC", "correctingLiabilityId": "…", "amountMinor": 0,
      "reverses": "<imported CC HSBC row id>", "archivedAccountId": "…" }
  ]
}
```

- `409` with `{ "error": "already_applied" }` when the reversal already
  exists (structural idempotency — the partial unique index refuses the
  batch; nothing is written, spec FR-023 / SC-009).
- `409` with `{ "error": "not_applicable" }` on a household that has no
  imported ADIB/HSBC rows (any household except the migrated one). The
  operation is seed-data-specific by nature; it hard-codes nothing into
  application logic for other households.
- `403` for member/viewer; `401` unauthenticated.

Audit: two entries per card (`create` citing D7 in the entry payload,
`archive` for the account row), same atomic batch.

## Contract test obligations (tests/contract/)

1. Every route: `401` when no/expired session.
2. Cross-household probes (`PATCH /api/cards/{other-household-id}`, state and
   card reads while a second household holds data): `404`-indistinguishable,
   zero foreign rows in any response — the SC-002 adversarial matrix.
3. Role matrix: viewer `403` on POST/PATCH/consolidation; member `403` on
   consolidation only; admin/owner pass.
4. Validation table for `422` cases (empty name, duplicate name, negative
   limit, day 0/32, float minor units).
5. Consolidation: success shape, second call `409 already_applied`,
   non-migrated household `409 not_applicable`.
6. `GET /api/state` returns every section in one response and derived figures
   match `deriveAll` on the same fixture (no drift between endpoint and
   library).
