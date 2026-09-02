# Quickstart: Multi-User Application

**Feature**: `004-multi-user-app` | **Date**: 2026-08-27

How to validate this feature end-to-end. Headless throughout — this feature
ships **no screens**; validation is the test suites, the CLI gates, and curl
against route handlers. When work reaches anything a person would look at, it
stops (see *The UI boundary*, below).

## Prerequisites

- Node.js 22+ (`nvm use` — Wrangler 4 refuses Node 20)
- `npm ci`
- Google OAuth client (id + secret) for local sign-in flows; local env in
  `.dev.vars` (gitignored): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `BETTER_AUTH_SECRET`, `OWNER_EMAIL`
- The committed dump `migration/sheet-dump.json` (parity fixture)

## V1 — Foundation still green (run first, run often)

The standing precondition (spec SC-010): Feature 003's proof must never
regress while 004 lands.

```bash
npm run typecheck && npm run lint:money && npm run coverage:check && npm test
```

Expect: all suites pass on **both** projects (better-sqlite3 and Miniflare
D1), goldens byte-identical.

## V2 — Parity evidence is pinned to a fresh import

The reconciliation gate runs against a **fresh** import of the dump — never
against a database that has the D7 correction applied (research.md R6).

```bash
rm -f .data/parity.db
npm run db:migrate:local -- --db .data/parity.db
npm run import -- --dump migration/sheet-dump.json --db .data/parity.db
npm run reconcile -- --db .data/parity.db
```

Expect: exit 0, report identical to Feature 003's evidence (D7 appears as the
resolved source-correction line, not a FAIL).

## V3 — Schema migration

```bash
npm run db:generate        # 0001 migration: auth tables, users columns, liabilities columns, card-name unique index
npm run db:migrate:local
```

Expect: additive only (see [data-model.md](data-model.md)); re-running V2
afterwards still passes — the migration alone changes no figure.

## V4 — Auth, provisioning, claim (tests)

```bash
npm run test:auth
```

Covers: session → `Identity` binding; first sign-in provisioning (household +
owner membership + audit, one atom); `OWNER_EMAIL` claim (membership repointed
from the placeholder, audited, one-time — second attempt refused); fail-closed
refusal (nothing persisted) when `OWNER_EMAIL` is unset while the migrated
household is unclaimed; recovery preconditions and the parked shell (membership
repointed onto the placeholder, nothing deleted, both audit entries anchored);
expired session ≡ no session. Google's servers are never
called — the seam under test is the session and the after-create hook
([research.md R12](research.md)).

Manual spot-check of the claim recovery path:

```bash
npm run claim -- --email you@example.com --db .data/local.db
```

## V5 — Cards and isolation (tests)

```bash
npm run test:unit && npm run test:isolation && npm run test:contract
```

Covers: card validation matrix (spec FR-017), including duplicate-name
refusal under concurrent writes (structural — the unique index, on both
drivers); create/update writes with
before/after audit in the same atom; the role matrix (viewer read-only,
member+ writes, admin+ corrections); the SC-002 adversarial matrix through
the session-derived path — including requests that explicitly name the other
household's ids, all answered `404`-indistinguishable; updated exported
surface list.

## V6 — The D7 consolidation (tests + figures)

```bash
npm run test:unit -- consolidation
```

Expect, on the corrected fixture (pinned figures, minor units, no tolerance):

| Figure | Before | After |
|---|---|---|
| ADIB card entities in current view | 3 unlinked rows | 1 (balance 60000) |
| `derived.shortTermLiabilities` | sheet parity | **+60000 exactly** |
| `netWorth.excludingInstallments` / `.includingInstallments` | sheet parity | **−60000 exactly, each** |
| Every other derived figure | — | unchanged |
| Imported rows | — | byte-identical, all still present |
| Second application | — | refused, zero rows written |
| HSBC | 3 unlinked rows | 1 entity, no figure moves |

## V7 — Live headless walkthrough (dev server)

`next dev`'s D1 binding is a separate local database from `.data/local.db`
(that one is `scripts/`' own `better-sqlite3` file, used by
`import`/`reconcile`/tests) — migrate it once via Wrangler's own tooling
before the first `npm run dev`, or every route answers `no such table`:

```bash
npm run db:migrate:wrangler   # applies db/migrations/*.sql to the wrangler-local D1 store
npm run dev                   # Next.js + OpenNext local, D1 binding via wrangler config
```

Then, with a browser only for the Google redirect (sign-in is the one step
curl cannot do) and curl for everything else, cookie-jarred:

```bash
curl -b jar.txt http://localhost:3000/api/state          # 200, full aggregated read
curl -b jar.txt -X POST http://localhost:3000/api/cards \
  -H 'content-type: application/json' -d '{"name":"Test Card","dueDay":5}'   # 201
curl http://localhost:3000/api/state                     # 401 (no cookie)
curl -b jar.txt -X POST http://localhost:3000/api/corrections/card-consolidation  # 200 once, 409 after
```

Full request/response shapes: [contracts/http-api.md](contracts/http-api.md).

## V8 — CI and bundle budget

```bash
npx opennextjs-cloudflare build && npx wrangler deploy --dry-run
```

Expect: compressed worker under the ~3 MiB cap (constitution bundle gate).
`.github/workflows/ci.yml` runs V1 + V2 + the full test set + this build check
on every push/PR (spec FR-029, SC-011). Verify by pushing a branch and
watching the run — CI did not exist before this feature; its first green run
is itself a deliverable.

## The UI boundary — STOP

This feature ends at the headless surface above. **No page, screen, layout,
component, color, or navigation may be designed or implemented under this
feature.** When implementation reaches a point where one would be needed —
including a styled sign-in page — work stops and the owner is notified to
supply designs (produced with Claude Design). The binding constraint is in
[spec.md → UI / Design Constraint](spec.md); it applies to `/speckit-tasks`
and implementation alike.

## What this feature does not deliver

No UI. No production deployment, no cutover, no backups (deferred — the
spreadsheet app keeps running untouched). No transaction/installment/account
write paths, no invitations, no card archival (deferred; see spec Deferred
table). The `.data/parity.db` fresh-import flow above stays the only
reconciliation subject; reconciling a corrected database against the dump is
a category error, not a failure.
