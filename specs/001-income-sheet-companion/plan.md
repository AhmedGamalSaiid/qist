# Implementation Plan: Income Sheet Companion

**Branch**: `001-income-sheet-companion` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-income-sheet-companion/spec.md`

## Summary

A single-user, mobile-first, bilingual (EN/AR with real RTL) web app served
entirely by a Google Apps Script Web App bound to the owner's existing
personal-finance sheet. One `getState()` RPC returns the whole app state;
eight write RPCs target a single server-side `WRITE_ALLOWLIST` of input
ranges and nothing else. Frontend is framework-free vanilla ES2020 served via
`HtmlService` templates (index + included partials), Chart.js from cdnjs,
sessionStorage cache with optimistic writes + rollback. Repo is managed with
clasp against the existing bound script project; the existing beautifier
`Code.gs` is pulled into the repo and never modified.

## Technical Context

**Language/Version**: Google Apps Script (V8 runtime) server-side; vanilla
ES2020 JavaScript, HTML, CSS client-side. No build step, no framework, no
transpiler.

**Primary Dependencies**: Apps Script services (`SpreadsheetApp`,
`HtmlService`, `LockService`, `Session`); Chart.js (pinned 4.x) from
`cdnjs.cloudflare.com` — the only external origin. `@google/clasp` as the
local dev/push tool (not a runtime dependency).

**Storage**: The Google Sheet (ID `1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc`)
is the sole canonical store. Client: `sessionStorage` for the last state
payload (cache only), `localStorage` for the language preference only.

**Testing**: Manual `TEST-CHECKLIST.md` (RTL matrix per screen, allowlist
negative tests via a temporary `test_allowlistRejections()` server function
run from the Apps Script editor and deleted afterward, optimistic-rollback
test via airplane mode). No automated test framework — Apps Script offers no
practical local runner for a bound project of this size, and the constitution
does not mandate one.

**Target Platform**: Mobile browsers first (Android Chrome, iOS Safari)
inside the Apps Script IFRAME sandbox at the `/exec` URL; desktop is the same
responsive layout enlarged.

**Project Type**: Web app — Apps Script Web App (`doGet` + `google.script.run`
RPCs), deployed "Execute as: me" / "Only myself".

**Performance Goals**: Cold load ≤ 4 s with exactly one state RPC; cached
revisit render ≤ 1 s; each write = one RPC that returns the affected
recomputed slice for reconciliation.

**Constraints**: Writes only through one guarded helper validating A1-range
containment against `WRITE_ALLOWLIST`; `LockService` around appends;
first-empty-row found by scanning column A values (pre-formatted blanks to
row 500 make `getLastRow()` wrong); no service worker/offline; no third-party
origins besides cdnjs; existing `Code.gs` untouched; all ranges discovered
dynamically (no hardcoded row counts).

**Scale/Scope**: One user. 9 tabs, ~17 accounts, 56 installment rows, ≤ 500
transaction rows, 10 screens, 2 locales. State payload well under 100 KB.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How the plan complies |
|---|-----------|--------|----------------------|
| I | Sheet is the single source of truth | PASS | Only store is the sheet; sessionStorage is cache-only (cleared = no loss); localStorage holds only the language preference, explicitly permitted; sheet remains fully standalone (app is additive; existing `Code.gs` untouched). |
| II | Formula safety is absolute | PASS | One `WRITE_ALLOWLIST` config object in `api.gs`; a single `guardedWrite()` helper checks A1 containment before any `setValue`; appends scan column A for the first truly empty row and never touch computed column G; no other code path writes. |
| III | No external backend | PASS | Bound Apps Script Web App, "Execute as: me" / "Only myself"; no servers, analytics, or secrets; sole CDN is cdnjs (Chart.js). |
| IV | Phone-first UX | PASS | Bottom nav (Home/Add/Installments/More); daily actions ≤ 3 taps; ≥ 44px targets; viewport meta via `addMetaTag`; desktop = responsive enlargement. |
| V | Bilingual EN/AR with real RTL | PASS | One `STRINGS = {en, ar}` dictionary in `i18n-js.html`; `document.dir` flips; CSS logical properties throughout; Chart.js `rtl` legend option follows language; Latin digits `#,##0`, `mm/dd/yyyy` both locales; `unicode-bidi: isolate` for mixed-direction names. |
| VI | Perceived speed over actual speed | PASS | Single `getState()` payload; sessionStorage instant render on revisit; optimistic writes with rollback + toast; manual refresh only; writes return recomputed slices to reconcile without a full refetch. |
| VII | Visual continuity with the sheet | PASS | Design tokens as CSS custom properties (navy `#1F3864`, blue `#2E75B6`, input yellow `#FFF2CC`, status green/amber/red); every editable control yellow-tinted, read-only never. |
| VIII | Honest scope | PASS | No service worker, no offline queue, no fake PWA; Add-to-Home-Screen walkthrough in DEPLOY.md; limitation stated in README. |

**Post-design re-check (after Phase 1)**: PASS — the RPC contract keeps every
write inside the allowlist, the data model stores no canonical data outside
the sheet, and the deploy/test docs preserve the standalone sheet. No
violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-income-sheet-companion/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── rpc-contract.md      # getState payload + all write RPCs
│   └── write-allowlist.md   # The definitive writable-range table
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
appsscript/                  # clasp rootDir — mirrors the bound script project
├── appsscript.json          # manifest (pulled; webapp access/executeAs verified)
├── Code.gs                  # EXISTING beautifier — pulled via clasp, never edited
├── api.gs                   # NEW: doGet, include(), WRITE_ALLOWLIST, guardedWrite,
│                            #      getState, 8 write RPCs, takeSnapshot bridge
├── index.html               # NEW: HtmlService template; shell + <?!= include() ?> partials
├── styles.html              # NEW: design tokens, logical-property layout, components
├── i18n-js.html             # NEW: STRINGS {en, ar}, t(), formatters, dir switching
└── app-js.html              # NEW: store, rpc promise helper (timeout + 1 retry),
                             #      screens/render, optimistic queue, charts

.clasp.json                  # scriptId + rootDir "appsscript" (created per clasp-setup.md)
.claspignore                 # push only appsscript/**
clasp-setup.md               # how to find scriptId, login, clone/pull safely
DEPLOY.md                    # push → deploy (Execute as me / Only myself) → /exec URL
                             #   → Android/iOS Add-to-Home-Screen walkthrough
TEST-CHECKLIST.md            # RTL matrix, allowlist negative tests, rollback test
README.md                    # what it is, honest no-offline statement, doc links
```

**Structure Decision**: Single flat Apps Script project under `appsscript/`
(clasp `rootDir`) because HtmlService `include()` needs sibling HTML files
and the bound project is one namespace anyway. Everything else at repo root
is documentation for the owner-operated deploy loop (Claude Code cannot reach
the Google account, so push/deploy steps are documented, not automated).

## Non-Goals (v1)

- No service worker, no offline queue (constitution VIII).
- No multi-user, no sharing, no auth beyond Google's own deployment gate.
- No editing of formulas, computed cells, headers, or history snapshot rows.
- No deleting or editing transactions — corrections are counter-entries, and
  the Add screen states this in a hint line.
- No automatic background refresh/polling; refresh is always user-initiated.
- No modification of the existing beautifier `Code.gs` or the sheet's
  structure, formats, or conditional-formatting rules.

## Complexity Tracking

> No constitution violations — table intentionally empty.
