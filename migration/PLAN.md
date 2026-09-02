# Migration: Apps Script + Google Sheets → Next.js on Cloudflare

**Status:** planning · **Started:** 2026-08-27

Move the Income Sheet Companion off Google Apps Script and off Google Sheets,
onto a Next.js application (frontend + backend in one deploy) running on
Cloudflare Workers with Cloudflare D1 as the data store.

## Decisions taken

| Decision | Choice | Consequence |
|---|---|---|
| Tenancy | **Multi-user product eventually** | Household/user/membership tables from day one; `household_id` on every domain row; every query scoped. No retrofit migration later. |
| Google Sheet after cutover | **Clean break** | Import once, then the sheet is a frozen read-only archive. The app becomes the single source of truth. No sync layer, no split-brain. |
| Cloudflare free-tier risk | **Measured — resolved** | A stock Next.js 16.3.3 app built through `@opennextjs/cloudflare` and bundled by Wrangler 4.127 comes to **977 KiB gzipped** against the free plan's ~3 MiB cap. ~2 MiB of headroom for Drizzle, Better Auth, charts and app code. Full SSR/RSC on the free tier is viable; no fallback needed. |

## Target stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3.3, App Router, Turbopack |
| Host | Cloudflare Workers via `@opennextjs/cloudflare` |
| Database | Cloudflare D1 (SQLite) + Drizzle ORM + Drizzle Kit migrations |
| Auth | Better Auth — Google OAuth, sessions in D1 |
| Money | Integer minor units in the DB; `decimal.js` for rate arithmetic. No floats anywhere near a balance. |
| Tests | Vitest, including golden tests that assert parity with the spreadsheet |
| Backups | Nightly D1 export to R2 via a Cron Trigger |
| Toolchain | **Node.js 22+ required** — Wrangler 4.x refuses to run on Node 20. Installed via nvm; `nvm use 22` (repo default alias left at 20). |

## Verified baseline (2026-08-27)

Measured against a throwaway scaffold, not estimated:

```
Next.js            16.3.3
@opennextjs/cloudflare build   ✓ clean
wrangler deploy --dry-run      Total Upload: 4666.10 KiB / gzip: 977.47 KiB
free-plan worker cap           ~3 MiB compressed
headroom                       ~2 MiB
static assets                  35 files / 852 KiB — served by Workers Static
                               Assets, does NOT count against the worker cap
```

The whole app — D1 client, auth, 13 screens, charts, i18n — has to fit in the
remaining ~2 MiB. That is a lot of room, but it is a budget, so it is worth
re-running `wrangler deploy --dry-run` at each phase rather than discovering a
problem at cutover.

## The actual risk

The financial logic is **not in this repository.** `api.gs` is almost entirely
readers — it copies numbers out of `Dashboard!A3:C12`, `Total!A1:L2`,
`Installments!G1:H10` that the spreadsheet's own formulas computed. Net worth,
asset mix, per-currency EGP conversion, the 3/6/12-month due windows, overdue
counts, monthly rollups: all of it lives in cells that nothing in this repo can
read. Only the nine formulas in `appsscript/Code.gs:88-97` are version-controlled.

So the project is not "swap the storage engine." It is **recover an
undocumented financial model, reimplement it, and prove the new numbers equal
the old ones.** Everything else is scaffolding.

`appsscript/dump.gs` exists to close that gap and is the first thing that has
to run.

## Phases

### Phase 0 — Extract the model  ⟵ *blocked on you*

Run `dumpModel()` from the Apps Script editor. It emits every formula, value,
number format, data-validation rule, conditional-format rule and input-yellow
cell as JSON. Save it to `migration/sheet-dump.json`. Read-only; the one side
effect is a JSON file in your Drive.

The input-yellow cells matter as much as the formulas: they are the sheet's own
declaration of what is an input versus what is derived, and they become the
write surface of the new API.

### Phase 1 — Schema + logic port

Normalized D1 schema with tenancy (sketch below). Every recovered formula
becomes a pure, typed, unit-tested function. Nothing derived gets stored.

### Phase 2 — Import + reconcile

One-time importer: `sheet-dump.json` → D1. Then a reconciliation report putting
every figure side by side, sheet vs. app. **Cutover does not happen until that
report is clean.** You are the oracle when they disagree.

### Phase 3 — Application

Port the 13 screens to React. The existing `styles.html` tokens, the 147-key
EN/AR dictionary in `i18n-js.html` and the pure derivation logic in
`plan-js.html` all carry over nearly intact. `google.script.run` calls become
route handlers and server actions. Keep optimistic writes and RTL.

### Phase 4 — Auth, deploy, backups, cutover

Better Auth + Google sign-in, household invites, roles. Nightly D1 → R2 export.
Sheet goes read-only.

## Schema sketch (Phase 1 input, not final)

```
households      id, name, base_currency, created_at
users           id, email, name, image, created_at            -- Better Auth
memberships     household_id, user_id, role(owner|admin|member|viewer), joined_at
invitations     household_id, email, role, token, expires_at

accounts        id, household_id, name, asset_class, is_investment,
                quantity_minor, opened_on, archived_at
transactions    id, household_id, occurred_on, kind(income|expense|transfer),
                category, amount_minor, currency, note, reverses_id, created_by
installments    id, household_id, plan_name, due_on, amount_minor, kind,
                paid_at, paid_by
liabilities     id, household_id, name, amount_minor, kind(short_term|property)
rates           id, household_id, asset_class, rate_minor, as_of, source
cards           id, household_id, name, limit_minor, statement_day, due_day
card_payments   id, household_id, card_id, due_on, amount_minor, paid_at
snapshots       id, household_id, taken_at, payload_json
income_settings household_id, salary_minor, pay_day, ...
audit_log       id, household_id, actor_id, action, entity, entity_id,
                before_json, after_json, at
```

Every domain table carries `household_id NOT NULL` with an index; the data
layer takes it from the session and never from a request parameter.

Two upgrades over the sheet, effectively free once the data is relational:
**`rates` keeps full history** (the sheet only ever holds the latest value, so
you cannot currently ask what your net worth was at last year's dollar rate),
and **`audit_log` records every write** — replacing the sheet's `LockService`
and the "corrections are counter-entries" convention with real transactions
plus an explicit `reverses_id` link.

## Open question for Phase 1

The sheet stores each account's **amount as a hand-edited current balance.**
A ledger system derives balances from transactions instead. Deriving is the
more correct design and makes the transaction log meaningful rather than
decorative — but it requires an opening balance per account and every movement
actually recorded, which is a real change in daily habit. Faithful port or
derived ledger is a genuine fork in the road and needs deciding before the
schema is frozen.

## Governance conflict

`.specify/memory/constitution.md` v1.0.0 forbids this migration outright:

- **Principle I — Sheet Is the Single Source of Truth:** "The app MUST NOT
  persist canonical data anywhere else: no databases…"
- **Principle III — No External Backend**

Those principles were correct for what the app was and are wrong for what it
is becoming. The constitution needs a **v2.0.0 amendment** — a breaking
governance change — before Phase 1 lands. Principles II (formula safety),
IV (phone-first), V (bilingual + RTL), VI (perceived speed) and VIII (honest
scope) survive intact and should carry over.

## Division of labour

**You** — run `dumpModel()` and commit the JSON; create the Cloudflare account
and API token; decide faithful-port vs. derived-ledger; set secrets; and act as
the oracle during Phase 2 reconciliation, because you are the only one who
knows which number is right.

**Me** — everything else: schema, migrations, formula port, tests, importer,
the application, deploy config, docs.
