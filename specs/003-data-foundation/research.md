# Research: Data Foundation Migration

Decisions behind the design, with the reasoning and what was rejected. Every
number here was computed against `migration/sheet-dump.json`, not estimated.

## R1 — Minor units and scale per asset class

**Decision**: every quantity is an integer in the smallest unit of its asset
class, with the scale fixed per class and never inferred.

| Asset class | Stored as | Scale | Example |
|---|---|---|---|
| EGP | piastres | 2 | 67,000.00 → `6700000` |
| USD | cents | 2 | 2,444.00 → `244400` |
| Gold | milligrams | 3 | 22.50 g → `22500` |
| Silver | milligrams | 3 | 750.00 g → `750000` |

Rates carry their own scale:

| Rate | Stored as | Scale | From dump |
|---|---|---|---|
| USD/EGP | ten-thousandths | 4 | 50.2554 → `502554` |
| Gold EGP/g | piastres | 2 | 7,500.00 → `750000` |
| Silver EGP/g | piastres | 2 | 102.00 → `10200` |

**Rationale**: gold is held in fractional grams (22.50), so a 2-decimal scale
would be lossy the moment a holding is recorded to the milligram. USD/EGP is
quoted to 4 decimals by the source feed and truncating it to 2 would shift
every converted figure. Fixing scale per class rather than per row means a
value can never be misread by assuming the wrong scale.

**Alternatives rejected**: a single global scale (breaks gold or wastes range);
storing decimal strings (defers the problem to every read site and invites
float parsing); floats (forbidden by Principle II).

## R2 — Rounding rule, and why the tolerance is what it is

**Decision**: round half-up to the target class's minor unit at each
conversion, then sum the rounded values. Reconciliation tolerance is
**±1 minor unit per rate conversion in the figure's derivation chain.**

**This was verified, not assumed.** Recomputing the full chain from the dump:

| Figure | Exact (float chain) | Integer model | Sheet displays |
|---|---|---|---|
| `Total!E2` USD→EGP | 122,824.1976 | **122,824.20** | 122,824.20 |
| `Investment!E2` | 1,809.1944 | **1,809.19** | 1,809.19 |
| `Investment!H2` gold | 168,750.00 | **168,750.00** | 168,750.00 |
| `Investment!K2` | 280,059.1944 | **280,059.19** | 280,059.19 |
| `Net Worth!B12` | 469,883.3920 | **469,883.39** | 469,883 |
| `Net Worth!B20` | 389,774.3920 | **389,774.39** | 389,774 |

The integer model reproduces every displayed value exactly. Maximum divergence
from the sheet's full-precision chain is **0.2 piastres** on `B12`, which
accumulates four separate conversions. The per-conversion tolerance of ±1 minor
unit therefore allows ±4 where 0.2 is observed — comfortable, without being so
loose it would hide a real error.

**Rationale**: the sheet carries float precision internally and rounds only at
display, so a divergence is inevitable and must be bounded rather than wished
away. Tying the bound to the number of conversions makes it proportional to
where error actually originates (FR-029, FR-030), instead of a blanket
allowance that would mask a genuine mistake in a pure sum.

**Alternatives rejected**: banker's rounding (does not match the sheet's
displayed values); carrying extra internal precision and rounding once at the
end (reproduces the float chain's opacity, and makes stored values not equal to
reported ones); a flat ±1 tolerance everywhere (too tight for `B12`'s four
conversions once holdings grow, too loose for a plain sum).

## R3 — Rate lookup semantics

**Decision**: a rate applies from its `as_of` date forward until superseded.
Converting on date *D* selects the newest rate whose `as_of` ≤ *D*. If none
exists, conversion fails loudly.

**Rationale**: FR-019 and FR-043 both require a missing rate to be visible
rather than substituted. Treating a rate as effective-from rather than
effective-on avoids demanding a rate record for every calendar day. Failing
rather than reaching forward to the nearest later rate matters because reaching
forward would silently value a 2024 transaction at a 2026 rate — exactly the
defect D6 exists to correct.

**Alternatives rejected**: nearest-rate-in-either-direction (silently invents
history); interpolation (fabricates a rate that never existed and cannot be
reconciled against anything); carrying a single current rate (this is precisely
the spreadsheet's flaw).

## R4 — Freezing a transaction's conversion (D6)

**Decision**: a transaction stores its native `amount_minor` and a foreign key
to the `rates` row in force on its date. The EGP value is computed at read time
from that pinned rate.

**Rationale**: this satisfies two requirements that look contradictory.
FR-012 forbids storing a derived value; FR-042 requires the conversion to be
frozen and never restated. Pinning the *rate* rather than the *result* gives
both — the figure is derived on every read, but from a fixed input, so it is
reproducible and stable. It also survives a later correction to rate history:
the link records which rate was actually used.

**Alternatives rejected**: storing `amount_egp_minor` directly (violates
FR-012, and hides which rate produced it); looking the rate up by date on every
read without pinning (a backfilled or corrected rate would silently restate
history).

## R5 — Structural tenant scoping (Principle IX)

**Decision**: `db/client.ts` is not exported beyond `lib/data/`. The only
exported surface is a repository factory taking a household context, and every
query it builds injects the `household_id` predicate. Handlers receive a
constructed repository and have no access to an unscoped client.

**Rationale**: Principle IX demands the unsafe query be *inexpressible*, not
merely discouraged. A lint rule or code-review convention fails the first time
someone is in a hurry. Making the raw client unreachable means the compiler
enforces it.

**Verification**: negative tests in `tests/isolation/` create two households,
then attempt cross-household reads — including by passing the other
household's id explicitly as a parameter — and assert every attempt returns
nothing.

**Alternatives rejected**: SQLite has no row-level security, so the database
cannot enforce this itself; a runtime assertion in each repository method
(catches mistakes only when that path is exercised); trusting review.

## R6 — Accepted divergences vs failures

**Decision**: the reconciliation report has three verdicts, not two:
**PASS** (exact), **PASS (tolerance)** carrying the observed difference, and
**DIVERGED** — a deliberate correction of a spreadsheet defect, registered in
advance with a reason. Anything else is **FAIL** and blocks completion.

Registered divergences at planning time:

| Figure | Divergence | Reason |
|---|---|---|
| `Transactions!G*` | Historical USD conversion frozen at the transaction date | D6 — the sheet restates past transactions at the live rate |
| `History` row 2 | Excluded from import | It is a live formula mirror, not a snapshot; importing it would persist a derived value (FR-012) |
| Net worth headline | Both `B19` and `B20` exposed | D4 — the sheet displays only `B20`, silently omitting 8,214,605 |

**Rationale**: with only PASS and FAIL, a deliberate correction is
indistinguishable from a bug, and the pressure is to "fix" correct code to
match a defect — which FR-010 and Principle X forbid outright. A divergence
must be registered *before* the report runs, so it cannot be invented
afterwards to explain away a surprise.

## R7 — Pinning the USD rate in tests

**Decision**: all golden tests pin USD/EGP to **50.2554**, the value captured
in the dump at `2026-08-27T10:06:31Z`.

**Rationale**: `Rates!B2` is `=GOOGLEFINANCE("CURRENCY:USDEGP")`, a live market
lookup. Every figure downstream of it — `Total`, `Investment`, `Net Worth`,
`Dashboard`, `History` row 2, `Transactions!G` — changes between one
spreadsheet recalculation and the next. Unpinned, golden tests would fail for
reasons entirely unrelated to the code, and the failures would be intermittent
and unreproducible. This is also why D5 replaces the live lookup with dated
records (FR-041).

## R8 — Timezone

**Decision**: one canonical timezone, `Africa/Cairo`, held as household
configuration rather than inferred from the runtime or the requesting device.
Every date-dependent computation takes "today" as an explicit parameter.

**Rationale**: the spreadsheet evaluates `TODAY()` in `America/Los_Angeles`
while the application uses `Africa/Cairo` — ten hours apart, so they disagree
about the date for ten hours of every day (FR-034, FR-035). Passing "today" in
as a parameter rather than reading a clock inside a derivation also makes every
`TODAY()`-dependent function deterministic and therefore testable, which
matters for `Installments!H5:H10` and the overdue rules.

**This dump is safe — but that must be checked, not assumed.** It was taken at
13:06 Cairo / 03:06 LA, both 2026-08-27, so its `TODAY()`-derived values are
internally consistent. Golden tests pin today = `2026-08-27`.

The safety is a property of *when this extraction happened*, not of the
extraction process, and nothing currently enforces it. The dump's recorded
timezone is still `America/Los_Angeles` — the sheet was never switched to
`Africa/Cairo` before extraction — so a re-extraction taken during the ten
hours the two disagree would silently produce a dump whose `TODAY()`-dependent
figures are internally inconsistent, with no symptom until goldens fail for
reasons that look like code defects.

**The importer and the reconciler therefore run a preflight** (FR-048): read
the dump's timezone and extraction timestamp, and refuse to proceed unless both
timezones place the extraction on the same calendar date. Four lines of check
that convert a latent, intermittent, misattributed failure into a refusal with
a reason.

Concretely, for this dump: `2026-08-27T10:06:31Z` is 2026-08-27 in both zones,
so the preflight passes. The single transaction is a live illustration of the
risk — it is stamped `2026-08-24T21:00:00.000Z`, which is 24 August in Los
Angeles and 25 August in Cairo.

**Alternatives rejected**: reading the system clock inside derivations (makes
them untestable and time-dependent); using the requesting device's timezone
(FR-035 forbids it, and it would make one person's overdue count differ from
another's in the same household).

## R9 — Local development against D1

**Decision**: Drizzle's SQLite dialect throughout, run against `better-sqlite3`
locally and D1 in Workers. Migrations generated by Drizzle Kit, never
hand-edited.

**Rationale**: D1 is SQLite, so one schema and one query surface serve both.
Running tests against in-process SQLite keeps the suite fast and offline;
Wrangler's local D1 covers the binding itself. Hand-editing generated
migrations breaks the ability to regenerate them from schema.

### R9a — Atomicity across D1 and local SQLite

**This was previously left as a caveat "flagged for the tasks phase". It is
resolved here instead**, because Principle II (ledger integrity) is
non-waivable and the plan's Constitution Check claims writes happen "inside a
transaction". An unresolved caveat cannot support that claim, and the
divergence is not discoverable late: it is a difference in the *shape* of every
write path, so finding it at deploy time would mean rewriting the data layer.

**Decision**: the data layer exposes exactly one write primitive —

```
atomically(statements: Statement[]) → Promise<void>
```

— which takes a **pre-built array of statements** and never a callback. On D1
it is `db.batch()`; locally it is `better-sqlite3`'s transaction wrapper over
the same array. Both are all-or-nothing.

**Rationale**: D1 has no interactive transactions. A callback-style
`transaction(async tx => …)` works locally and cannot be implemented on D1,
so accepting a callback anywhere would let code be written that passes every
local test and fails only in a Worker. Taking an array makes the restriction
structural: there is no way to express a read-then-decide-then-write cycle
inside the atom, because the statements must all exist before the atom opens.

**What this costs**: any logic that needs to read before deciding what to write
does the read *before* calling `atomically`, and encodes its decision as a
conditional statement — a `WHERE` clause, or an `INSERT … WHERE NOT EXISTS`.
The `reverses_id` cycle walk and the importer's upserts are both written this
way. This is a real constraint on how the data layer is written, and it is why
it is settled now rather than discovered later.

**Verification**: the isolation and import suites run twice in CI — once
against `better-sqlite3` and once against Wrangler's local D1 — from the same
test bodies. A path that only works on one is a failure, not a caveat.

**Alternatives rejected**: a callback API with a documented "don't do this on
D1" note (documentation does not prevent it, and the failure appears only in
production); deferring the decision to feature 004 (the write paths are built
here, so the constraint has to shape them here).
