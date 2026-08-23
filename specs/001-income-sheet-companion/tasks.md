# Tasks: Income Sheet Companion

**Input**: Design documents from `/specs/001-income-sheet-companion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rpc-contract.md, contracts/write-allowlist.md, quickstart.md

**Tests**: No automated test tasks — the plan specifies manual verification via `TEST-CHECKLIST.md` (created in the Polish phase) and the quickstart validation scenarios. Apps Script offers no practical local runner for this bound project.

**Organization**: Tasks are grouped by user story (US1–US8, priorities P1–P8 from spec.md) so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (US1–US8) — user-story phases only
- Every task names its exact file path(s)

## Path Conventions

Apps Script web app per plan.md: all runtime code lives flat under `appsscript/` (clasp rootDir); owner-facing docs live at the repository root. The existing `appsscript/Code.gs` (beautifier) is pulled by the owner via clasp and **never edited by any task**.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repository skeleton, clasp wiring, and the pull-first safety documented before any code exists.

- [X] T001 Create repo skeleton: `appsscript/` directory and `.claspignore` at repo root pushing only `appsscript/**` (ignore all root docs and dotfiles)
- [X] T002 [P] Write `clasp-setup.md` at repo root: how to find the scriptId (sheet → Extensions → Apps Script → Project Settings), `clasp login`, and the mandatory pull-before-push workflow (`clasp clone <scriptId> --rootDir appsscript`) with an explicit warning that pushing without a local `Code.gs` deletes the remote beautifier (research R1)
- [X] T003 [P] Create `.clasp.json` at repo root with `rootDir: "appsscript"` and a `<SCRIPT_ID>` placeholder, referencing `clasp-setup.md` for how the owner fills it in
- [X] T004 Create `appsscript/appsscript.json` manifest: V8 runtime, timezone, `webapp` block (`executeAs: USER_DEPLOYING`, `access: MYSELF`), with a comment-note in `clasp-setup.md` that the owner's pulled manifest wins on conflict and must be verified against these settings

**Checkpoint**: Repo pushes cleanly to the bound project without endangering `Code.gs`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The serving shell, write-safety core, single state read, client store/RPC plumbing, and i18n/format mechanics that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Implement `doGet()` and `include(filename)` in `appsscript/api.gs`: evaluated `index.html` template, `.addMetaTag('viewport', 'width=device-width, initial-scale=1')`, default IFRAME sandbox (research R5); define the error-code constants (`VALIDATION`, `RANGE_DENIED`, `LOG_FULL`, `LOCK_TIMEOUT`, `ALREADY_PAID`, `DUPLICATE_NAME`, `MARKER_MISSING`)
- [X] T006 Implement the frozen `WRITE_ALLOWLIST` object (keyed by RPC name per contracts/write-allowlist.md) and `guardedWrite(sheetName, a1, values)` in `appsscript/api.gs` — the only function that may call `setValue(s)`; validates A1 containment against the caller's entry, refuses multi-cell targets exceeding the resolved shape, throws `RANGE_DENIED` otherwise
- [X] T007 Implement dynamic range resolvers in `appsscript/api.gs`: last non-empty `Data!A` row, last installment schedule row, first blank `Transactions!A2:A500` row, first empty `History` row after the "SNAPSHOTS ↓" marker — all resolved server-side at call time, throwing structure-drift errors when tabs/markers/headers are missing (spec edge case "unexpected sheet structure")
- [X] T008 Implement `getState()` in `appsscript/api.gs`: read all 9 tabs in one execution into the `AppState` shape from data-model.md (dashboard, data, total, installments+summary, investment, rates, netWorth, transactions recent-50+monthly, history, meta with `fetchedAt`/`sheetUrl`); Dates → ISO strings, money → plain numbers (research R2); no writes
- [X] T009 [P] Create `appsscript/index.html`: HtmlService template shell with `<?!= include(...) ?>` for styles/i18n/app partials, Chart.js 4.4.x pinned from cdnjs with SRI integrity attribute (research R7), bottom nav (Home / Add / Installments / More), the More menu, and empty containers for all 10 screens
- [X] T010 [P] Create `appsscript/styles.html`: design tokens as CSS custom properties (navy `#1F3864`, blue `#2E75B6`, editable yellow `#FFF2CC`, status green `#E2EFDA` / amber `#FFF3CD` / red `#FCE4E4`), logical properties only (`margin-inline-*`, `text-align: start`, …), base components (cards, chips, list rows, toasts, confirm dialog, bottom nav), ≥ 44px touch targets, `.editable` yellow-tint convention
- [X] T011 [P] Create `appsscript/i18n-js.html`: `STRINGS = {en: {...}, ar: {}}` with the full English key set, `t(key)`, `fmt(n)` via `Intl.NumberFormat('en-US')` (`#,##0` Latin digits), `fmtUsd(n)` (`$#,##0.00`), `fmtDate()` (`mm/dd/yyyy`), `applyLanguage(lang)` setting `document.documentElement.lang`/`.dir`, language preference persisted to `localStorage["isc:lang"]` (research R8)
- [X] T012 Create `appsscript/app-js.html` core: `store = {state, lang, pending, stale}`, sessionStorage cache (`isc:state`) load/save, `rpc(name, ...args)` Promise wrapper (30 s timeout, exactly 1 retry for reads, never for writes — research R6), `OptimisticPatch` queue (apply / revert / merge returned slice), toast system, screen router + render dispatch, manual refresh action replacing the whole cached state
- [X] T013 Implement load/error states in `appsscript/app-js.html`: boot sequence (render from cache if present → single `getState()` on cold load), "data as of" indicator from `meta.fetchedAt`, failed-cold-load-with-no-cache "can't reach your sheet" view with retry button, error-code → localized toast mapping, write-timeout → mark `store.stale` and prompt manual refresh

**Checkpoint**: App shell loads, `getState()` returns the full payload, allowlist guard is in place — user stories can start.

---

## Phase 3: User Story 1 - Glanceable Financial Snapshot (Priority: P1) 🎯 MVP

**Goal**: Home screen with all Dashboard KPIs, asset-mix donut, unpaid-by-year bars; instant cached render on revisit.

**Independent Test**: Open the app cold and verify every Home figure equals the corresponding Dashboard-tab cell; revisit and verify figures render before any network round-trip completes (quickstart V1/V2).

### Implementation for User Story 1

- [X] T014 [P] [US1] Build the Home screen markup in `appsscript/index.html`: KPI card grid (net worth, total assets, liquid, investments, next installment due, overdue count, due next 12 months, USD/EGP rate), canvas elements for the two charts, "data as of" slot
- [X] T015 [P] [US1] Add Home-specific styles in `appsscript/styles.html`: KPI card variants, countdown badge, red overdue highlight state, chart containers
- [X] T016 [US1] Implement Home rendering in `appsscript/app-js.html` from `state.dashboard`: all KPI values via `fmt()`/`fmtDate()`, next-due countdown badge computed against the device's current date at render time (never cached — research R9), overdue count red-highlighted only when > 0
- [X] T017 [US1] Implement the asset-mix doughnut and unpaid-by-year bar charts in `appsscript/app-js.html` using Chart.js with a shared create/destroy/rebuild lifecycle helper (needed later for language switch), colors from the design tokens

**Checkpoint**: Read-only MVP — cold load ≤ 4 s with exactly one `getState` execution; cached revisit renders ≤ 1 s.

---

## Phase 4: User Story 2 - Log a Transaction in Seconds (Priority: P2)

**Goal**: One-tap-from-Home Add screen; optimistic append to the sheet's Transactions log with rollback on failure; recent-10 list.

**Independent Test**: Log an expense end-to-end; verify the sheet's first empty log row gets a real Date/number, column G computes itself, and the monthly summary updates (quickstart V3/V4).

### Implementation for User Story 2

- [X] T018 [US2] Implement `addTransaction(tx)` in `appsscript/api.gs`: server-side re-validation of every field (enums exact per data-model.md, amount finite > 0, account must exist in `Data!A`, note ≤ 500 chars) → under `LockService` script lock scan `Transactions!A2:A500` for first blank A → `guardedWrite` exactly `A{r}:F{r}` (real Date in A, real number in E) and `H{r}`, never G → re-read and return `{recent, monthly, dashboard}`; throw `LOG_FULL` when no blank row ≤ 500 (research R3)
- [X] T019 [P] [US2] Build the Add screen markup in `appsscript/index.html`: type toggle (Expense preselected), 13 one-tap category chips, account `<select>` fed from `state.data`, amount input (`inputmode="decimal"`), EGP/USD currency toggle, optional note field (Arabic-capable), date input defaulting to today, submit button, corrections-are-counter-entries hint line, recent-10 list container
- [X] T020 [US2] Implement Add screen logic in `appsscript/app-js.html`: client-side validation (required fields, numeric > 0 amount) with reasons shown, optimistic insert into the recent list + success toast on RPC resolve, rollback + error toast on failure (including `LOG_FULL` message telling the owner to extend the sheet), recent-10 list rendering with type-colored amounts, form reset keeping ≤ 3 taps from Home to submit

**Checkpoint**: The flagship write works end-to-end with optimistic UX and the sheet's own formulas computing EGP + monthly summary.

---

## Phase 5: User Story 3 - Mark an Installment Paid (Priority: P3)

**Goal**: Installments screen grouped by status with the sheet's colors; two-tap mark-paid with optimistic flip.

**Independent Test**: Mark one unpaid installment paid; verify `Installments!E{row}` reads "Yes" and summary figures recompute; verify status colors match the sheet's conditional formatting same-day (quickstart V5/V6).

### Implementation for User Story 3

- [X] T021 [US3] Implement `setInstallmentPaid(row)` in `appsscript/api.gs`: validate row within the dynamic schedule extent, throw `ALREADY_PAID` if current value is "Yes", `guardedWrite` `Installments!E{row}` = `"Yes"` only, return `{installments, dashboard}`
- [X] T022 [P] [US3] Build the Installments screen markup in `appsscript/index.html`: summary card block, grouped sections (overdue → due-soon → upcoming → paid collapsed) with empty-state slots, confirm dialog reuse
- [X] T023 [US3] Implement Installments rendering + interaction in `appsscript/app-js.html`: derive each row's status at render time against today's date (`paid` / `overdue` / `dueSoon` ≤ 3 months / `upcoming` — data-model rules matching the sheet's conditional formatting), group and color rows, summary card from `state.installments.summary`, tap unpaid row → confirm dialog → optimistic flip + RPC (exactly two taps), no confirm offered on already-paid rows, rollback + error toast on failure, `ALREADY_PAID` merged silently

**Checkpoint**: Second write path done; status parity with the sheet verifiable row-by-row.

---

## Phase 6: User Story 4 - Update Exchange & Metal Rates (Priority: P4)

**Goal**: Rates screen with three editable rate fields; saving auto-sets the as-of date to today.

**Independent Test**: Change the USD rate; verify `Rates!B2` updates, `C2` = today automatically, and every EGP-converted figure matches the sheet after refresh (quickstart V7).

### Implementation for User Story 4

- [X] T024 [US4] Implement `setRate(key, value)` in `appsscript/api.gs`: `key ∈ {usd, gold, silver}` → row 2/3/4, value finite > 0, atomically `guardedWrite` `Rates!B{r}` = value and `Rates!C{r}` = today (real Date) in the same execution, return `{rates, dashboard, total, investment, netWorth}`
- [X] T025 [US4] Build the Rates screen in `appsscript/index.html` and `appsscript/app-js.html`: three yellow-tinted rate inputs with read-only "as of" dates, client-side validation (finite > 0, empty rejected with reason), per-rate save with optimistic update + rollback, reconciliation of the five returned slices

**Checkpoint**: Rate changes propagate to every converted figure via the sheet's own recomputation.

---

## Phase 7: User Story 5 - Maintain Accounts, Liabilities & Property Inputs (Priority: P5)

**Goal**: Full input parity with the sheet's yellow cells — account amounts + new accounts, the 7 liability amounts, the 3 property paid-to-date values — on the Accounts, Total & Investment, and Net Worth screens.

**Independent Test**: Edit one account amount, add one account, edit one liability, edit one property value; verify each lands in exactly the intended cell and nothing else changed (quickstart V9).

### Implementation for User Story 5

- [X] T026 [P] [US5] Implement `setAccountAmount(row, value)` and `addAccount(acc)` in `appsscript/api.gs`: amount write to `Data!D{row}` within the dynamic extent; addAccount under script lock validating non-empty non-duplicate name (`DUPLICATE_NAME`), category enum, checkbox-compatible boolean in C, date defaulting to today, `guardedWrite` `A{r}:E{r}` at last real account row + 1; both return `{data, total, investment, dashboard, netWorth}`
- [X] T027 [P] [US5] Implement `setLiabilityAmount(row, value)` (`Total!J{row}`, row ∈ [4,10], finite ≥ 0, returns `{total, dashboard, netWorth}`) and `setPropertyPaid(row, value)` (`Net Worth!B{row}`, row ∈ {9,10,11}, finite ≥ 0, returns `{netWorth, dashboard}`) in `appsscript/api.gs`
- [X] T028 [P] [US5] Build the Accounts screen markup in `appsscript/index.html`: account list with category + investment badges and yellow-tinted amounts, edit-amount inline control, add-account form (name, category select, investment toggle, amount, date)
- [X] T029 [P] [US5] Build the Total & Investment and Net Worth screen markup in `appsscript/index.html`: per-class totals table, credit/total rows, investment row as cards (USD figure slot), liabilities list with yellow-tinted amounts (names read-only), net-worth statement lines with only the three property values yellow-tinted
- [X] T030 [US5] Implement rendering + edit flows for all three screens in `appsscript/app-js.html`: `<bdi>`-wrapped names (Arabic like "فرش"), investment USD figure via `fmtUsd()`, optimistic edit/add with rollback for all four RPCs, new account appearing in the Add form's account list after slice merge/refresh, everything non-allowlisted rendered read-only with no yellow tint

**Checkpoint**: Every yellow cell in the sheet is now editable from the app and nothing else is.

---

## Phase 8: User Story 6 - Switch to Arabic with Real RTL (Priority: P6)

**Goal**: Full Arabic translation with real RTL mirroring on every screen, format-stable numbers/dates, persistent preference.

**Independent Test**: Toggle to Arabic and walk all 10 screens against the RTL checklist; toggle back and re-verify LTR; reopen in a new session and confirm Arabic persists (quickstart V10).

### Implementation for User Story 6

- [X] T031 [P] [US6] Complete the Arabic dictionary in `appsscript/i18n-js.html`: translate every `STRINGS.en` key to `STRINGS.ar` (nav, screen titles, labels, hints, toasts, error messages, empty states, confirm dialogs)
- [X] T032 [US6] Implement the language toggle (in the More menu) and switch flow in `appsscript/app-js.html`: `applyLanguage()` flips `lang`/`dir`, re-renders all screens without refetching data, persists to `localStorage`, destroys and rebuilds all Chart.js charts with `rtl: isArabic` + `textDirection` on legends/tooltips (research R7)
- [X] T033 [US6] RTL audit pass across `appsscript/styles.html` and `appsscript/index.html`: fix any physical-direction property to its logical equivalent, verify bottom nav / forms / tables / lists mirror under `dir="rtl"`, ensure all mixed-direction values (account names, notes, liability names) are `<bdi>`-isolated, confirm numbers stay Latin `#,##0` and dates `mm/dd/yyyy` in Arabic

**Checkpoint**: The app is fully bilingual; both directions pass the same visual checks.

---

## Phase 9: User Story 7 - Take a Net-Worth Snapshot & See History (Priority: P7)

**Goal**: History screen with snapshot table + net-worth line chart and a guarded "Take snapshot" action reusing the sheet's own logic.

**Independent Test**: Take a snapshot; verify one new static row lands after the last snapshot in the sheet and a new point appears on the chart; double-tap creates no duplicate (quickstart V11).

### Implementation for User Story 7

- [X] T034 [US7] Implement `takeSnapshot()` in `appsscript/api.gs`: under script lock, invoke the existing `addSnapshot` global if callable, otherwise mirror its behavior without editing `Code.gs` (copy History live-row current values as static values to the first empty row after the "SNAPSHOTS ↓" marker via `guardedWrite`); throw `MARKER_MISSING` on structure drift; return `{history}` (research R10)
- [X] T035 [US7] Build the History screen in `appsscript/index.html` and `appsscript/app-js.html`: snapshot table (7 columns, newest visible), net-worth-over-time line chart from `state.history`, "Take snapshot" button with confirm dialog and disabled-while-in-flight double-tap guard, chart updates immediately after the returned slice merges

**Checkpoint**: Month-end ritual is one confirmed tap; sheet snapshot logic untouched.

---

## Phase 10: User Story 8 - Browse Everything the Sheet Knows (Priority: P8)

**Goal**: Filterable Transactions screen with monthly summary cards, and a Settings screen (refresh, open-sheet link, about) — completing 100% read parity.

**Independent Test**: Verify each figure on these screens equals the corresponding sheet cell; verify month/type/category filters narrow the list correctly (quickstart V1 parity + spec US8 scenarios).

### Implementation for User Story 8

- [X] T036 [P] [US8] Build the Transactions screen in `appsscript/index.html` and `appsscript/app-js.html`: monthly summary cards from `state.transactions.monthly` (month, income, expenses, net saved, savings rate), full list of `recent` with type-colored amounts and `<bdi>` notes, combinable month/type/category filters, empty-state when filters match nothing
- [X] T037 [P] [US8] Build the Settings screen in `appsscript/index.html` and `appsscript/app-js.html`: refresh action (full `getState` refetch replacing the cache, shared with the global refresh), "Open Google Sheet" link from `state.meta.sheetUrl`, about section with the honest no-offline statement, language toggle entry point (wired in US6)

**Checkpoint**: All 10 screens live; every Data Contract value is viewable in the app.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Owner-facing docs, manual test assets, and final audits against the success criteria.

- [X] T038 [P] Write `DEPLOY.md` at repo root: `clasp push`, first deployment (Web app, Execute as **Me**, access **Only myself**), copying the `/exec` URL, re-deploy-on-update via Manage deployments (stable URL), and Android Chrome + iOS Safari Add-to-Home-Screen walkthroughs
- [X] T039 [P] Write `TEST-CHECKLIST.md` at repo root: per-screen EN/LTR + AR/RTL matrix, allowlist negative tests with the full source of a temporary `test_allowlistRejections()` function (attempts on `Dashboard!A3`, `Transactions!G2`, a header row, `History!A2` — each must throw `RANGE_DENIED`; delete afterwards), airplane-mode optimistic-rollback test, editable-equals-yellow audit, status-color parity check
- [X] T040 [P] Write `README.md` at repo root: what the app is, the sheet it binds to, the honest online-only/no-offline statement (FR-026), and links to `clasp-setup.md`, `DEPLOY.md`, `TEST-CHECKLIST.md`, and the spec docs
- [X] T041 Final cross-screen audit pass over `appsscript/styles.html`, `appsscript/index.html`, `appsscript/app-js.html`: every editable control yellow-tinted and zero read-only figures tinted (SC-010), all touch targets ≥ 44px, every daily action ≤ 3 taps from Home (SC-002/003), no hardcoded display strings outside `STRINGS`
- [ ] T042 Run the quickstart validation scenarios V1–V13 from `specs/001-income-sheet-companion/quickstart.md` with the owner performing the 👤 steps (push, deploy, on-device checks); record results and fix any failures
      **Blocked on the owner** — every V1–V13 step needs the Google account
      (clasp login, push, deploy, on-device checks). Code and docs are ready:
      follow `clasp-setup.md` → `DEPLOY.md` → `TEST-CHECKLIST.md`, starting
      with the allowlist negative tests. Report any failure back here.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. Owner performs the clasp pull per `clasp-setup.md` before any push.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories.** Within it: T005 → T006 → T007 → T008 on `api.gs` (same file, sequential); T009/T010/T011 in parallel; T012 → T013 after T009–T011.
- **User Stories (Phases 3–10)**: All depend only on Phase 2. They can proceed sequentially P1 → P8 (recommended for one developer, since most client tasks touch the same three HTML partials) or selectively in parallel where marked.
- **Polish (Phase 11)**: T038–T040 can start anytime after Phase 2; T041–T042 need all desired stories complete.

### User Story Dependencies

- **US1 (P1)**: Foundational only — the read-only MVP.
- **US2 (P2)**: Foundational only. Independent of US1 (Add screen + its own slice reconciliation).
- **US3 (P3)**: Foundational only.
- **US4 (P4)**: Foundational only.
- **US5 (P5)**: Foundational only. (New accounts feed the US2 account list via state, not via code coupling.)
- **US6 (P6)**: Foundational only for mechanics; translating every string is most efficient after US1–US5 exist, but the dictionary + switch are independently testable on whatever screens exist.
- **US7 (P7)**: Foundational only.
- **US8 (P8)**: Foundational only.

### Within Each User Story

- Server RPC task(s) before or parallel with markup; screen logic last (it wires both).
- All writes go through `guardedWrite` (T006) — no story adds any other write path (Constitution II).

### Parallel Opportunities

- Phase 1: T002 and T003 in parallel after T001.
- Phase 2: T009, T010, T011 in parallel (three different files).
- Any story's `api.gs` task can run in parallel with that story's `index.html` markup task (different files) — e.g. T018 ∥ T019, T021 ∥ T022, T026 ∥ T027 ∥ T028 ∥ T029.
- Phase 11: T038, T039, T040 in parallel (three different docs).
- Across stories, `api.gs` write RPCs (T018, T021, T024, T026, T027, T034) conflict on the same file — sequence them; client screen tasks across stories also share `index.html`/`app-js.html` — sequence unless splitting by section is coordinated.

---

## Parallel Example: User Story 5

```bash
# After Phase 2, launch in parallel (different files):
Task: "T026 Implement setAccountAmount + addAccount in appsscript/api.gs"      # api.gs
Task: "T028 Build Accounts screen markup in appsscript/index.html"             # index.html
# then sequence the same-file pair:
Task: "T027 Implement setLiabilityAmount + setPropertyPaid in appsscript/api.gs"  # after T026 (same file)
Task: "T029 Build Total & Investment + Net Worth markup in appsscript/index.html" # after T028 (same file)
# finally:
Task: "T030 Wire rendering + edit flows in appsscript/app-js.html"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (owner completes the clasp pull — `Code.gs` must exist locally before any push)
2. Phase 2: Foundational (shell, allowlist guard, `getState`, store/RPC/i18n plumbing)
3. Phase 3: US1 Home screen
4. **STOP and VALIDATE**: quickstart V1/V2 — cold load ≤ 4 s, one RPC, cached revisit ≤ 1 s, every figure equals the Dashboard tab
5. Deploy via `DEPLOY.md` loop — a genuinely useful read-only app

### Incremental Delivery

Each subsequent phase is one deployable increment: US2 (log expenses) → US3 (mark paid) → US4 (rates) → US5 (full input parity) → US6 (Arabic/RTL) → US7 (snapshots) → US8 (full browse) → Polish. After every increment: `clasp push`, new deployment version, run that story's quickstart scenario on the phone.

### Notes

- `appsscript/Code.gs` is never edited by any task; T034 calls into it (or mirrors it) without modification.
- Tests are manual by design: `TEST-CHECKLIST.md` (T039) + quickstart scenarios (T042) are the acceptance gate; the temporary `test_allowlistRejections()` server function is added, run, and deleted by the owner in the Apps Script editor.
- Expanding `WRITE_ALLOWLIST` beyond contracts/write-allowlist.md is prohibited as a side effect of any task (Constitution II).
- Commit after each task or logical group; stop at any checkpoint to validate the story independently.
