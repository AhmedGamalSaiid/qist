# Tasks: Credit Card Payments & Monthly Cash-Flow Planning

**Input**: Design documents from `/specs/002-credit-card-planning/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Not requested — this project has no automated test framework (plan.md, Technical Context). Every story phase ends with a manual checkpoint mapped to the spec's Independent Test; the full validation pass is [quickstart.md](quickstart.md).

**Organization**: Tasks are grouped by user story (US1–US6 from spec.md) so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)

## Path Conventions

Flat Apps Script project — all source under `appsscript/` (clasp rootDir), docs at repo root, per plan.md Project Structure. **Note**: most client tasks edit the same four files (`index.html`, `app-js.html`, `i18n-js.html`, `styles.html`), so tasks touching the same file are never [P] even across stories.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new source files and the one-time sheet setup so every later task has a home and a sheet to write to.

- [X] T001 Create `appsscript/planning.gs` with the file header comment (role, pointer to specs/002 contracts) and implement `setupCreditCardPlanning()` exactly per [contracts/sheet-layout.md](contracts/sheet-layout.md): create `CC Payments` tab if absent; headers `A1:F1` (Card, Due Date, Amount (EGP), Statement Month, Paid, Note); settings labels `H2:H4` + seeded values `I2:I4` (2250, USD, 27); `Cards` header `H6` + seeded card list `H7:H10`; number formats (`B` mm/dd/yyyy, `C` #,##0, `D` text `@`); data validations (`E` Yes/No, `A` from `H7:H26`, `I3` USD/EGP, `I4` 1–31); yellow+blue input styling on `A2:F500` and `I2:I4`; Installments-style conditional format rules on `A2:F500`; tab colour. Must be idempotent — re-running never overwrites non-blank data cells.
- [X] T002 [P] Create `appsscript/plan-js.html` as an empty `<script>` module with shared pure primitives: `ccStatus_(payment, todayIso)` (Paid/Overdue/Pending projection per data-model.md), `monthKey_(isoDate)` → `"yyyy-mm"`, `clampDayToMonth_(year, month, day)` (BR-006), `parseStatementMonth_(text, dueDate)` (blank ⇒ due-date month, FR-006). No DOM access, no store access — everything takes inputs and returns values.
- [X] T003 Include the new partial in `appsscript/index.html`: add `<?!= include('plan-js') ?>` between the `i18n-js` and `app-js` includes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: State payload, write-path allowlist, navigation shell — everything all six stories sit on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 In `appsscript/planning.gs`, add dynamic resolvers `lastCcRow_()` (last row 2–500 with non-blank `CC Payments!A`) and `firstBlankCcRow_()` (first blank-A row in 2–500, or −1), mirroring the `firstBlankTransactionRow_` pattern in `appsscript/api.gs`.
- [X] T005 In `appsscript/planning.gs`, add readers `readCreditCards_(ss)` and `readIncome_(ss)` returning the [contracts/rpc-contract.md](contracts/rpc-contract.md) slice shapes; when the `CC Payments` tab is missing return `{setup:false, cards:[], payments:[]}` / `{salary:null}` instead of throwing; `paid` = `E === "Yes"` case-insensitive; blank statement month emitted as the due date's `mm/yyyy`.
- [X] T006 In `appsscript/api.gs`, attach the two new slices in `getState()`: `creditCards: readCreditCards_(ss)` and `income: readIncome_(ss)`. No other change to `getState()` and no change to any existing reader (FR-041).
- [X] T007 In `appsscript/api.gs`, add the five frozen entries to the existing `WRITE_ALLOWLIST` object exactly per [contracts/write-allowlist.md](contracts/write-allowlist.md): `addCcPayment` (A:F, rows 2–500), `setCcPaymentStatus` (E, rows 2–500), `updateCcPayment` (A:F, rows 2–500), `deleteCcPayment` (A:F, rows 2–500), `setSalary` (I, rows 2–4). This is the feature's entire write-path change — nothing else becomes writable.
- [X] T008 In `appsscript/index.html`, add the three empty screen sections (`screen-cards`, `screen-plan`, `screen-forecast` with `data-screen` attributes) and the 5th bottom-nav button `data-nav="plan"` (icon + `data-t="navPlan"`) between Installments and More.
- [X] T009 In `appsscript/app-js.html`, register the new screens: add `plan` to the nav wiring, add Cards and Forecast entries to `MORE_ITEMS`, add the three renderers (stubs for now) to `renderActiveScreen()`'s dispatch, and add a shared guard that renders a "run setup" notice (key `setupNeeded`) on all three screens and skips the Home plan card when `store.state.creditCards.setup === false`.
- [X] T010 In `appsscript/i18n-js.html`, add the shared navigation/shell keys to both `en` and `ar`: `navPlan`, `moreCards`, `moreForecast`, screen titles (`creditCards`, `monthlyPlan`, `forecast`), and `setupNeeded` (instruction naming `setupCreditCardPlanning()`).

**Checkpoint**: `clasp push` + run `setupCreditCardPlanning()` once + redeploy → app loads with three empty screens reachable, 5-button nav in both languages, `getState()` payload carries `creditCards` + `income`, and every pre-existing figure is unchanged (record the SC-005 baseline now).

---

## Phase 3: User Story 1 — Record what each credit card needs paid, and when (Priority: P1) 🎯 MVP

**Goal**: Payments recorded per card with amount/due date/status/note; per-card monthly grouping and still-to-pay totals; two-way Paid toggle with zero side effects; edit/delete corrections.

**Independent Test**: Add payments for two cards in two months, reopen the app — each card shows its own payments grouped by month with correct amounts/dates; toggling Paid survives refresh and leaves the transaction log and all account balances untouched (spec US1 Independent Test + scenarios 1–5).

### Implementation for User Story 1

- [X] T011 [US1] In `appsscript/planning.gs`, implement `addCcPayment(payment)` per [contracts/rpc-contract.md](contracts/rpc-contract.md): validate card against the live card list, amount finite > 0, due date `yyyy-mm-dd`, note ≤ 500 chars (FR-005); default statement month to the due-date month (FR-006); under `withLock_`, resolve `firstBlankCcRow_()` (throw `LOG_FULL` on −1) and `guardedWrite` `A{r}:F{r}` = `[card, dueDate, amount, statementMonth, "No", note]`; return `{creditCards: readCreditCards_(ss)}`.
- [X] T012 [US1] In `appsscript/planning.gs`, implement `setCcPaymentStatus(row, paid)`: row must be 2–500 and currently hold a payment (non-blank A) else `VALIDATION`; write `E{row}` `"Yes"`/`"No"` via `guardedWrite`; **no** `ALREADY_PAID` check — freely reversible both ways (BR-002); return `{creditCards}`.
- [X] T013 [US1] In `appsscript/planning.gs`, implement `updateCcPayment(row, payment)` (same field validation as add, plus `paid` boolean preserved into E; row must hold a payment; single `guardedWrite` of `A{row}:F{row}`) and `deleteCcPayment(row)` (row must hold a payment; write six empty strings to `A{row}:F{row}`); both return `{creditCards}` (FR-012).
- [X] T014 [US1] In `appsscript/index.html`, fill `screen-cards`: an add-payment form (card chip grid, amount input `inputmode="decimal"`, date input, optional statement-month input, optional note, submit) with every editable control class `editable`, plus a container `#cardGroups` for the per-card lists.
- [X] T015 [US1] In `appsscript/app-js.html`, implement the add-payment flow: render card chips from `state.creditCards.cards`; on submit validate locally, default statement month, then check duplicates — an existing payment with same card+amount+dueDate, or any installment with same dueDate+amount (BR-012) — and show `confirmDialog` warning before proceeding; optimistic append to `store.state.creditCards.payments` with rollback, via `optimisticWrite` + `addCcPayment`.
- [X] T016 [US1] In `appsscript/app-js.html`, implement `renderCards()`: one section per card (in card-list order) showing payments grouped by `statementMonth`-independent due-date month (FR-020), each row with amount, due date, derived status pill (`ccStatus_`), note; per-card still-to-pay total (Pending+Overdue only, FR-011/FR-022); explicit `nothingDue` state for cards with no payments; `bdi()` isolation on card names.
- [X] T017 [US1] In `appsscript/app-js.html`, wire per-payment actions on the Cards screen: single-tap status toggle (optimistic, both directions, SC-010), and an edit sheet + delete action behind an explicit tap with `confirmDialog` (FR-012), calling `updateCcPayment` / `deleteCcPayment` with rollback on failure.
- [X] T018 [US1] In `appsscript/styles.html`, add Cards-screen styles: card section headers, month group headings, status pills reusing the existing green/amber/red tokens (FR-009), still-to-pay total row, `nothingDue` empty state — logical properties only (RTL-safe), targets ≥ 44px.
- [X] T019 [US1] In `appsscript/i18n-js.html`, add US1 keys (en + ar): `addCardPayment`, `card`, `dueDate`, `statementMonthOptional`, `stillToPay`, `nothingDue`, `statusPending`, `statusPaid`, `statusOverdue`, `markPaid`, `markUnpaid`, `editPayment`, `deletePayment`, `deletePaymentConfirm`, `duplicateWarning`, `installmentMatchWarning`, `paymentSaved`.

**Checkpoint**: US1 fully functional via More → Cards — run spec US1 scenarios 1–5 (add, group, reject invalid, toggle both ways + refresh, note display) and verify the sheet shows the rows and hand edits round-trip (SC-008).

---

## Phase 4: User Story 2 — See one dated timeline of everything due in a month (Priority: P1)

**Goal**: The Plan screen's month view: combined chronological timeline of credit-card payments + installments, month total, per-category subtotals, month navigation, empty state — installments read-only from existing data (FR-021).

**Independent Test**: With one card payment and one installment in the same month, the month view lists both in date order labelled by source with a correct combined total, while the Installments screen figures are unchanged (spec US2 Independent Test).

### Implementation for User Story 2

- [X] T020 [US2] In `appsscript/plan-js.html`, implement `buildMonthObligations_(state, monthKey)`: merge CC payments and installment rows dated in the month (by due date, FR-020) into Obligation Timeline Entries `{date, sourceType, sourceName, amountEgp, status}` (data-model.md), sorted date-ascending with same-date entries kept separate; return entries plus `ccTotal`, `installmentTotal`, `totalObligations` (all statuses, BR-003) and `stillToPay` (Pending+Overdue, FR-022).
- [X] T021 [US2] In `appsscript/app-js.html`, implement `renderPlan()` v1: month navigation state (default current month, prev/next reaching any month in the horizon, FR-035), month total + credit-cards/installments subtotal chips, the dated timeline grouped under date headings with source label + amount + status, explicit empty state for a month with no obligations, and the "+ Card payment" button opening the US1 add form (completing the 3-tap path, FR-040).
- [X] T022 [US2] In `appsscript/index.html`, fill `screen-plan` markup: month navigation header, totals/verdict container `#planVerdict` (placeholder for US3/US4), timeline container `#planTimeline`, "+ Card payment" button.
- [X] T023 [US2] In `appsscript/styles.html`, add Plan-screen styles: month nav bar, subtotal chips, date-heading timeline list with source-type accents (card vs installment, FR-042), empty state.
- [X] T024 [US2] In `appsscript/i18n-js.html`, add US2 keys (en + ar): `plan`, `monthTotal`, `creditCardsSubtotal`, `installmentsSubtotal`, `noObligations`, `sourceInstallment`, `prevMonth`, `nextMonth`.

**Checkpoint**: Spec US2 scenarios 1–4 pass; **then compare every installment/dashboard figure against the Phase-2 baseline — must be numerically identical (US2 #5, SC-005)**.

---

## Phase 5: User Story 3 — Know the month's income, remainder and shortage (Priority: P2)

**Goal**: Recurring salary shown per month (original + converted EGP), monthly remaining/surplus and shortage verdicts, salary editable, rate-change awareness, rate-missing honesty.

**Independent Test**: With salary configured, a month with obligations < income reports a surplus and a month with obligations > income + opening balance reports a shortage of exactly the difference (spec US3 Independent Test).

### Implementation for User Story 3

- [X] T025 [US3] In `appsscript/planning.gs`, implement `setSalary(salary)`: validate amount finite > 0, currency in {USD, EGP}, day integer 1–31; three single-cell `guardedWrite`s to `I2`, `I3`, `I4`; return `{income: readIncome_(ss)}` (FR-014).
- [X] T026 [US3] In `appsscript/plan-js.html`, implement `buildIncomeEvents_(state, monthKey)`: project the salary into the month on `clampDayToMonth_` day (FR-015, BR-006); convert non-EGP at `state.rates.usd.value` keeping the original amount+currency alongside (BR-005, FR-016); when currency ≠ EGP and the rate is missing/zero/non-finite return `incomeUnavailable: true` with no converted figure — never 0 (FR-017).
- [X] T027 [US3] In `appsscript/plan-js.html`, extend the month computation with `totalIncome`, `monthlyRemaining` (= B0 + income − stillToPay, rule 7) and `monthlyShortage` (= max(0, −monthlyRemaining), rule 8), taking the opening balance `B0` as a parameter (current month: `state.total.totalOfAll`; callers pass carry-forwards later).
- [X] T028 [US3] In `appsscript/app-js.html`, render the income/verdict section of `renderPlan()`: expected income line showing both `$2,250` and the converted EGP (or the `incomeUnavailable` notice with a tap-through to the Rates screen), remaining-after-obligations as surplus, or shortage amount presented as "must be covered" (FR-018); an Income card showing salary settings with an edit form (amount/currency/day) submitting `setSalary` optimistically.
- [X] T029 [US3] In `appsscript/i18n-js.html`, add US3 keys (en + ar): `expectedIncome`, `salary`, `salaryDay`, `editSalary`, `remaining`, `surplus`, `shortage`, `mustBeCovered`, `incomeUnavailable`, `setRatePrompt`.

**Checkpoint**: Spec US3 scenarios 1–5 pass — including changing the USD rate in the app and watching every derived figure move with no extra RPC (FR-033), and rate = 0 showing income as unavailable.

---

## Phase 6: User Story 4 — Know what to prepare before the salary lands (Priority: P2)

**Goal**: The day-by-day running-balance walk: first shortfall date and "amount to prepare" before income arrives, shown as a fact distinct from the monthly surplus/shortage, starting from the labelled Total-tab opening balance.

**Independent Test**: With the Total tab's "Total of All in EGP" below an obligation dated before the salary day, the plan reports the timing shortfall and an amount-to-prepare equal to the gap while still reporting a positive end-of-month balance (spec US4 Independent Test; worked example in spec "Cash-Flow Calculation Rules").

### Implementation for User Story 4

- [X] T030 [US4] In `appsscript/plan-js.html`, implement `walkMonth_(events, openingBalance, todayIso, isCurrentMonth)` implementing spec rules 1–10 literally: unpaid obligations negative on due date, income positive; sort date-ascending with negatives before positives on the same date (BR-007); Paid obligations excluded (FR-028); for the current month only events dated today-or-later (rule 10); outputs `firstShortfallDate` (rule 4, FR-025), `amountToPrepare` (largest deficit at/before the next income event, rule 5, FR-026), `closingBalance` (rule 6).
- [X] T031 [US4] In `appsscript/plan-js.html`, assemble `computeMonthlyPlan(state, monthKey, openingBalance)` returning the full Monthly Plan object of [data-model.md](data-model.md) (timeline, totals, income, walk outputs, `openingAsOf` from `state.meta.fetchedAt`, `isProjection`), and verify it reproduces the spec's worked example (B0 400, ADIB 1,000 on 25th, installment 1,000 + salary $2,250 @ 48.50 on 27th ⇒ prepare 1,600, first shortfall the 25th, remaining +107,525) via a temporary console check removed before commit.
- [X] T032 [US4] In `appsscript/app-js.html`, render the timing verdict in `#planVerdict`: the opening balance labelled **"Total of All in EGP"** with its as-of time (FR-030/FR-032), a warning block when a shortfall exists — first uncoverable date + amount to prepare before it (FR-025–FR-027) — or an all-covered confirmation; monthly shortage and timing shortfall displayed as two distinct facts (FR-027); shortage/timing styling via existing red/amber tokens, surplus via green (FR-038).
- [X] T033 [US4] In `appsscript/i18n-js.html`, add US4 keys (en + ar): `openingBalance`, `openingBalanceLabel` ("Total tab's Total of All in EGP"), `asOf`, `firstShortfall`, `amountToPrepare`, `prepareBefore`, `allCovered`, `timingWarning`, `basedOnZero`.

**Checkpoint**: Spec US4 scenarios 1–6 pass, including: Paid obligations don't reduce the walk, all-after-salary months report nothing to prepare even at B0 = 0, and the zero/unreadable-B0 edge shows "based on 0 available" labelling rather than hiding the verdict.

---

## Phase 7: User Story 5 — Look ahead across the coming months (Priority: P3)

**Goal**: 12-month forecast table (income / cards / installments / total / remaining-or-shortage per row), closing balances carried forward (negatives included), shortage rows marked, projection labelling, row tap-through to the month's plan.

**Independent Test**: With obligations across three future months, the table shows one correct row per month and tapping a row opens that month's timeline (spec US5 Independent Test).

### Implementation for User Story 5

- [X] T034 [US5] In `appsscript/plan-js.html`, implement `computeForecast(state, horizonMonths)`: current month + 11 (BR-008), chaining `closingBalance → openingBalance` including negatives (FR-029); future months marked `isProjection` (BR-009); expose any obligations dated beyond the horizon as a `beyondHorizonTotal` so no outstanding figure silently drops them (edge "horizon boundary").
- [X] T035 [US5] In `appsscript/app-js.html` + `appsscript/index.html`, implement `renderForecast()` into `screen-forecast`: one row per month (income, credit cards, installments, total obligations, remaining/shortage), shortage rows visually marked (FR-038), projection label on future months, row tap navigates the Plan screen to that month (FR-036); reachable from the Plan screen header and More menu.
- [X] T036 [US5] In `appsscript/styles.html` + `appsscript/i18n-js.html`, add forecast styles (horizontally scrollable table inside the card, shortage-row treatment) and keys (en + ar): `forecastTitle`, `monthColumn`, `projectionLabel`, `shortageMonth`, `beyondHorizon`.

**Checkpoint**: Spec US5 scenarios 1–4 pass, including a projected negative closing balance carrying into the next row.

---

## Phase 8: User Story 6 — Answer "what's next?" at a glance from Home (Priority: P3)

**Goal**: Home summary card: total due this month, nearest unpaid obligation (source, amount, date), shortage indicator when the current month has one — tapping opens the Plan screen.

**Independent Test**: With current-month obligations entered, Home shows the correct month total and nearest unpaid obligation, and the warning appears only when a shortage/timing gap exists (spec US6 Independent Test).

### Implementation for User Story 6

- [X] T037 [US6] In `appsscript/plan-js.html`, implement `computeHomeSummary(state)`: current-month `totalObligations` and `stillToPay`, nearest unpaid obligation searching forward across months when the current month is fully paid (US6 #3, returning an explicit none-state), and the current month's `amountToPrepare`/shortage indicator when non-zero.
- [X] T038 [US6] In `appsscript/app-js.html` + `appsscript/index.html`, render the Home plan card at the top of `renderHome()` (FR-037): month total due, nearest payment line (source name, amount, date), shortage indicator with amount to prepare; whole card taps through to the Plan screen; hidden entirely when `creditCards.setup === false`.
- [X] T039 [US6] In `appsscript/i18n-js.html` + `appsscript/styles.html`, add US6 keys (en + ar): `dueThisMonth`, `nextPayment`, `noUpcomingPayments`, `prepareShort` — and the Home-card styles (compact KPI card, warning accent).

**Checkpoint**: Spec US6 scenarios 1–3 pass; SC-002 holds (state the month total + next payment within 10 s of opening the app).

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, safety verification, bilingual/RTL audit, full validation.

- [X] T040 [P] Extend `TEST-CHECKLIST.md`: RTL matrix rows for the three new screens + Home card; allowlist negative tests for the five new callers (wrong sheet, wrong column, row 1, row 501, multi-row, shape mismatch — per [contracts/write-allowlist.md](contracts/write-allowlist.md)); `LOG_FULL` on a full table; SC-010 byte-identical toggle check; the SC-005 before/after figure comparison; the US4 worked example.
- [X] T041 [P] Update `README.md`: feature summary (cards, monthly plan, forecast), the one-time `setupCreditCardPlanning()` step, the D-001 opening-balance caveat (all-assets figure, stated plainly per constitution VIII).
- [ ] T042 Audit all new UI for FR-039/constitution V: no user-visible string outside `STRINGS` (grep `appsscript/index.html` + `app-js.html` for literals), `bdi()` on every sheet-sourced name, Latin digits `#,##0` and `mm/dd/yyyy` everywhere, both `dir` layouts visually checked per new screen.
  - **Static portion done** (no live app available in this environment): grepped `index.html`/`app-js.html` for literal user-visible text outside `t()`/`STRINGS` — none found; confirmed `bdi()` on every sheet-sourced value (card names, payment notes, timeline `sourceName`, Home's `nearestUnpaid.sourceName`); fixed one Latin-digit risk — the opening-balance "as of" timestamp used `toLocaleString()` with no locale (follows system locale, could render Arabic-Indic digits under an Arabic OS locale) — now forces `'en-US'` explicitly.
  - **Still needs a human**: actually opening both `dir="ltr"` and `dir="rtl"` on a phone/browser and eyeballing the three new screens + Home card, per the matrix in [TEST-CHECKLIST.md §11.1](../../TEST-CHECKLIST.md).
- [ ] T043 Verify perceived-speed gates (constitution VI): cold load performs exactly one `getState()`; month navigation and forecast cause zero RPCs; every new write is optimistic and rolls back with a toast in airplane mode; 3-tap FR-040 path counted from Home.
  - **Static portion done**: grepped `renderPlan()`/`renderForecast()`/`openingBalanceForMonth_()` — zero `rpc()` calls (pure `plan-js.html` derivation only); `rpc('getState')` still only called from `boot()` and the Settings `fullRefresh()` button, unchanged; all five new RPCs (`addCcPayment`, `setCcPaymentStatus`, `updateCcPayment`, `deleteCcPayment`, `setSalary`) confirmed routed through `optimisticWrite()`, so they apply/render immediately and roll back + toast on failure by construction.
  - **Still needs a human**: the actual airplane-mode rollback behavior and a stopwatch on the 3-tap path, on a real device against the deployed app.
- [ ] T044 Run the full [quickstart.md](quickstart.md) validation end-to-end in English and Arabic, including the Apps Script editor safety tests (temporary `test_ccAllowlistRejections()`, deleted afterward) and the final SC-005 baseline comparison.
  - **Static portion done**: the derivation logic in `plan-js.html` (`computeMonthlyPlan`, `computeForecast`, `computeHomeSummary`, `clampDayToMonth_`, `parseStatementMonth_`) was extracted and run under Node against 10 scenarios including the spec's exact worked example (B0 400, ADIB 1,000/25th, installment 1,000 + salary $2,250@48.50/27th) plus FR-006/FR-017/FR-028/FR-029/BR-006/BR-007/BR-008/BR-009/rule-10 edge cases — all 30 assertions pass. The ready-to-paste `test_ccAllowlistRejections()` function is now in [TEST-CHECKLIST.md §11.2](../../TEST-CHECKLIST.md).
  - **Still needs a human**: `clasp push`, run `setupCreditCardPlanning()` once, redeploy, then walk every scenario in [quickstart.md](quickstart.md) against the real sheet in both languages, run the pasted allowlist test in the Apps Script editor, and do the SC-005 before/after comparison.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T001 ∥ T002; T003 after T002.
- **Foundational (Phase 2)**: After Setup. T004 → T005 → T006; T007 independent of T004–T006 (same file as T006 — do sequentially); T008 → T009; T010 anytime. **Blocks all stories.**
- **US1 (Phase 3)**: After Phase 2. Server T011–T013 can proceed in parallel with client T014; T015–T017 after T014 (and T011–T013 for the live path); T018/T019 alongside.
- **US2 (Phase 4)**: After Phase 2; the "+ Card payment" button (T021) needs US1's form (T014/T015). T020 is pure and parallel with T022.
- **US3 (Phase 5)**: After US2 (extends the month computation and Plan screen). T025 independent of T026–T027.
- **US4 (Phase 6)**: After US3 (walk consumes income events). T030 → T031 → T032 → T033.
- **US5 (Phase 7)**: After US4 (forecast chains full monthly plans).
- **US6 (Phase 8)**: After US4 (needs `amountToPrepare`); independent of US5.
- **Polish (Phase 9)**: After all desired stories. T040/T041 [P]; T042–T044 sequential.

### User Story Dependencies

```
Setup → Foundational → US1 (MVP)
                       US2 (uses US1's add form for its + button)
                       US3 → US4 → US5
                                └→ US6
```

US1 and US2 are both P1 and together form the spec's "recording + seeing" core; US2's derivation work (T020) can start in parallel with US1's client work since they touch different files. US5 and US6 are mutually independent after US4.

### Parallel Opportunities

- **Phase 1**: T001 ∥ T002 (different files).
- **Phase 3**: T011–T013 (`planning.gs`) ∥ T014 (`index.html`) ∥ T018 (`styles.html`) ∥ T019 (`i18n-js.html`).
- **Cross-story**: pure derivation tasks in `plan-js.html` (T020, T026–T027, T030–T031, T034, T037) never conflict with server tasks in `planning.gs` (T011–T013, T025).
- **Constraint**: `app-js.html`, `index.html`, `i18n-js.html`, `styles.html` are shared files — tasks touching the same file must serialize even across stories (this is why most client tasks carry no [P]).

## Parallel Example: User Story 1

```bash
# After Phase 2, launch in parallel (four different files):
Task: "T011–T013 write RPCs in appsscript/planning.gs"
Task: "T014 Cards screen markup in appsscript/index.html"
Task: "T018 Cards styles in appsscript/styles.html"
Task: "T019 US1 strings in appsscript/i18n-js.html"
# Then serially in appsscript/app-js.html:
Task: "T015 add-payment flow" → "T016 renderCards()" → "T017 toggle/edit/delete"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phases 1–2 (Setup + Foundational), run `setupCreditCardPlanning()` once, record the SC-005 baseline.
2. Phase 3 (US1) → validate via More → Cards.
3. **STOP and VALIDATE**: US1 alone already replaces the owner's paper reminders — deployable increment.

### Incremental Delivery

Each phase checkpoint is a deployable `clasp push` + redeploy: US1 (record) → US2 (timeline — re-verify SC-005 here) → US3 (verdict) → US4 (amount to prepare — the feature's raison d'être) → US5 (forecast) → US6 (Home glance) → Polish.

### Notes

- All server writes go through `guardedWrite` against the T007 allowlist entries — if any task seems to need another range, stop and revisit [contracts/write-allowlist.md](contracts/write-allowlist.md) rather than widening ad hoc.
- Commit after each task or logical group; every checkpoint is independently verifiable against spec acceptance scenarios.
- Deploy reminder: pushing does not update `/exec` — redeploy the Web App version (README "clasp redeploy trap").
