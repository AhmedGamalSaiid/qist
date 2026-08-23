# Phase 0 Research: Income Sheet Companion

No `NEEDS CLARIFICATION` markers existed in the Technical Context — the
feature description pinned the stack. Research therefore focused on the known
sharp edges of the chosen stack. Each item: Decision / Rationale /
Alternatives considered.

## R1. clasp push semantics vs. the existing `Code.gs`

- **Decision**: The first repo step is `clasp clone <scriptId>` (or
  `.clasp.json` + `clasp pull`) so the existing beautifier `Code.gs` and
  `appsscript.json` land in `appsscript/` BEFORE any push. `Code.gs` is
  committed and never edited. `clasp-setup.md` makes this ordering explicit
  and warns about it.
- **Rationale**: `clasp push` mirrors the local rootDir to the cloud project
  — a remote file with no local counterpart is deleted. Pushing without
  pulling first would silently destroy the beautifier, violating the "left
  untouched" constraint and Principle I (sheet standalone usability).
- **Alternatives considered**: `.claspignore`-based partial push (rejected:
  ignore rules affect what is pushed, not what is preserved remotely — the
  reliable protection is having the file locally); editing in the online
  editor only (rejected: no local repo/diff history).

## R2. Serializing state across `google.script.run`

- **Decision**: `getState()` builds plain objects and returns them through
  one `JSON.parse(JSON.stringify(...))`-safe structure in which every Date is
  converted server-side to an ISO `yyyy-mm-dd` string and every currency
  value to a plain number. The client owns all display formatting
  (`#,##0`, `mm/dd/yyyy`, `$#,##0.00`).
- **Rationale**: `google.script.run` rejects or mangles non-primitive types
  (legacy Date restrictions, `null` prototypes); strings/numbers are
  guaranteed safe. Formatting client-side keeps both locales consistent
  (Latin digits everywhere) without double round-trips.
- **Alternatives considered**: returning `getDisplayValues()` strings
  (rejected: locale-ambiguous re-parsing for math like countdown badges);
  passing Date objects (rejected: fragile across sandbox versions).

## R3. Finding the first truly empty transaction row

- **Decision**: Server-side, read `Transactions!A2:A` values and scan for the
  first blank cell; write the new row there with `setValues` on exactly
  `A:F` + `H` (two ranges: `A{r}:F{r}` and `H{r}`), wrapped in
  `LockService.getScriptLock()` (acquire → find row → write → release).
- **Rationale**: The tab is pre-formatted with blank rows to 500, so
  `getLastRow()`/`appendRow()` would land at row 501 outside formats and
  dropdowns. The lock closes the race window between "find row" and "write"
  (double-submit, retry after timeout). Column G is never in any written
  range, satisfying FR-006.
- **Alternatives considered**: `appendRow` (wrong row, and writes a
  contiguous A:H clobbering G); client-computed target row (rejected: stale
  cache could overwrite — spec edge case demands server-side discovery at
  write time).

## R4. Write-safety enforcement shape

- **Decision**: One frozen `WRITE_ALLOWLIST` object in `api.gs` keyed by RPC
  name, each entry a list of allowed A1 ranges (some dynamic: “Data column D
  from row 2 to last real account row + 1”, “first empty transaction row”).
  A single `guardedWrite(sheetName, a1, values)` resolves the target,
  checks containment against the caller's allowlist entry, throws on any
  mismatch, and is the only function in the file that calls `setValue(s)`.
- **Rationale**: Constitution II demands one auditable config and
  server-side rejection; funneling every mutation through one helper makes
  the negative tests in TEST-CHECKLIST.md meaningful (test the helper, and
  you've tested every endpoint).
- **Alternatives considered**: per-endpoint inline checks (rejected:
  scattered, unauditable); Sheets protected ranges as the only defense
  (rejected: the web app executes as the owner, who bypasses protections —
  useful belt-and-suspenders but not sufficient).

## R5. HtmlService serving & mobile shell

- **Decision**: `doGet` returns the evaluated `index.html` template with
  `.addMetaTag('viewport', 'width=device-width, initial-scale=1')`,
  `XFrameOptionsMode.DEFAULT`, default IFRAME sandbox. Partials via the
  standard `include(filename)` pattern (`HtmlService.createHtmlOutputFromFile(...).getContent()`).
- **Rationale**: IFRAME is the only modern sandbox; `addMetaTag` is the only
  way to set the viewport (template `<head>` meta tags are stripped);
  the include() pattern is the canonical no-build way to split CSS/JS/i18n
  into maintainable files.
- **Alternatives considered**: single monolithic index.html (rejected:
  unmaintainable at ~10 screens + 2 locales); bundlers (rejected: “no build
  step” constraint).

## R6. RPC promise helper, timeout, retry, and optimistic reconcile

- **Decision**: Wrap `google.script.run` in `rpc(name, ...args)` returning a
  Promise with a 30 s timeout and exactly 1 retry for **reads**; writes get
  the timeout but **no automatic retry** (a timed-out write may still have
  landed — retrying could double-append). Every write RPC returns the
  affected recomputed slice (e.g. `addTransaction` → `{recent, monthly,
  dashboard}`), which the client merges over its optimistic state; on error
  the optimistic patch is rolled back and an error toast shown. After a
  write timeout, the client marks the cache stale and prompts a refresh
  instead of retrying.
- **Rationale**: Apps Script latency is 1–3 s with occasional spikes; the
  slice-return avoids a 2nd full `getState` after each write (Principle VI)
  while keeping the sheet the computer of record. Non-retried writes protect
  the append-only log from duplicates that the LockService alone cannot
  prevent across two distinct successful calls.
- **Alternatives considered**: full refetch after each write (rejected:
  doubles perceived latency); client-side recomputation of totals (rejected:
  duplicates sheet formulas — the sheet is the only computer of truth).

## R7. Chart.js via cdnjs, pinned, RTL-aware

- **Decision**: Pin Chart.js 4.4.x from `cdnjs.cloudflare.com` with SRI
  integrity attribute. Three charts: doughnut (asset mix), bar (unpaid by
  year), line (net-worth history). Legends/tooltips get `rtl: isArabic` and
  `textDirection` set on language switch; charts are destroyed and rebuilt
  on language change (cheapest correct option at this scale).
- **Rationale**: cdnjs is the sole permitted origin (Constitution III);
  pinning + SRI protects against CDN tampering/drift; Chart.js has built-in
  RTL support for legends/tooltips which satisfies Principle V for chart
  content.
- **Alternatives considered**: hand-rolled SVG charts (rejected: more code
  than the rest of the app); Google Charts loader (rejected: pulls from
  gstatic.com — not an allowed origin).

## R8. i18n/RTL mechanics

- **Decision**: `i18n-js.html` holds `STRINGS = {en: {...}, ar: {...}}` and
  `t(key)`; language switch sets `document.documentElement.lang` and
  `.dir`, re-renders all screens, persists to `localStorage`. All CSS uses
  logical properties (`margin-inline-*`, `padding-inline-*`, `inset-inline-*`,
  `text-align: start`) so `dir="rtl"` mirrors for free. Numbers formatted by
  a single `fmt(n)` using `Intl.NumberFormat('en-US')` (Latin digits,
  `#,##0`) and dates by `fmtDate()` producing `mm/dd/yyyy` — same in both
  locales. Mixed-direction names wrapped in `<bdi>` (unicode-bidi isolation).
- **Rationale**: Matches Constitution V exactly; logical properties avoid a
  parallel `.rtl` stylesheet; `<bdi>` is the standards mechanism for names
  like "فرش" inside LTR text; forcing `en-US` numerals prevents Arabic-Indic
  digits from `ar` locale formatting.
- **Alternatives considered**: `[dir=rtl]` override rules per component
  (rejected: double maintenance); `Intl` with `ar` locale + `nu-latn`
  (rejected: more moving parts for the same output).

## R9. Session cache & staleness

- **Decision**: The full state payload is stored in `sessionStorage` under
  one key with `meta.fetchedAt`. On boot: render from cache if present, then
  nothing automatic — a "data as of" indicator plus manual refresh
  (pull-to-refresh gesture on lists + refresh buttons). Installment status
  colors and the next-due countdown are computed at render time against the
  device's current date, never persisted.
- **Rationale**: Principle VI (instant revisit) + spec edge case "stale
  cache on a new day" (status must follow today's date even if data is
  cached). sessionStorage (not localStorage) keeps the cache non-canonical
  and short-lived by construction.
- **Alternatives considered**: auto-refresh on visibilitychange (rejected
  for v1: surprise data churn mid-entry; manual refresh is the spec'd
  contract).

## R10. Snapshot bridge

- **Decision**: `takeSnapshot()` RPC re-implements nothing: it calls the
  same logic the sheet's existing `addSnapshot()` performs (locate History
  first empty row after the "SNAPSHOTS ↓" marker, copy the live formula
  row's current values as static values), guarded by LockService and the
  allowlist's append-only History entry, and returns the new snapshot row.
  If the existing global `addSnapshot` function is callable from `api.gs`
  (same project namespace), call it directly; otherwise mirror its behavior
  without editing `Code.gs`.
- **Rationale**: The bound project shares one global namespace, so the
  existing function is directly invocable — reuse honors "the app is
  additive". A double-tap guard client-side (disabled button while in
  flight) plus the confirm dialog prevents duplicate snapshots.
- **Alternatives considered**: duplicating snapshot logic in `api.gs`
  (fallback only, if the existing function proves signature-incompatible).

## R11. Deployment & operations model

- **Decision**: Owner-operated loop documented in three files: 
  `clasp-setup.md` (find scriptId via Extensions → Apps Script → Project
  Settings, `clasp login`, clone/pull-first workflow), `DEPLOY.md`
  (`clasp push`, create Web App deployment "Execute as: me" / "Who has
  access: Only myself", copy the `/exec` URL, re-deploy on update, plus
  Android Chrome and iOS Safari Add-to-Home-Screen walkthroughs), and
  `TEST-CHECKLIST.md` (manual acceptance).
- **Rationale**: Claude Code has no access to the owner's Google account, so
  every cloud-touching step must be a precise human-runnable document; the
  deployment settings are constitutionally mandated (III).
- **Alternatives considered**: CI-driven clasp push (rejected: no repo
  remote/CI exists, single user, and credentials in CI contradict the
  no-third-party principle).
