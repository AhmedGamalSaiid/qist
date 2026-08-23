# Feature Specification: Income Sheet Companion

**Feature Branch**: `001-income-sheet-companion`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "Build 'Income Sheet Companion': a mobile-first bilingual (EN/AR) web app, served entirely by Google Apps Script bound to my existing personal-finance Google Sheet, giving full read parity with all 9 sheet tabs and safe editing of exactly the sheet's designated input cells." (Full description includes an audited sheet structure treated as the data contract, 10 screens, 6 user stories, and key acceptance criteria — incorporated throughout this spec.)

## Data Contract: The Existing Sheet *(authoritative)*

The app's entire data model is the owner's existing Google Sheet (ID
`1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc`), audited as follows. Ranges
below are the domain contract; the implementation must still discover row
extents dynamically (row counts grow), never hardcode them.

| Tab | Read scope | App-editable scope |
|-----|-----------|--------------------|
| Dashboard | KPI table A3:C12 (net worth current, total assets, liquid, investments, short-term liabilities, remaining installments to 2046, next installment due date + amount, due next 12 months, overdue count, USD/EGP rate); asset-mix E1:F6 (EGP cash / USD / Gold / Silver / Property, in EGP); unpaid installments by year H1:I22 (2025–2045) | none |
| Data | Accounts: A Name, B Category (USD/EGP/Gold/Silver/Liability), C Investment flag, D Amount, E Date; ~17 rows from row 2, count varies | D amounts; appending a complete new account row (A–E) |
| Total | Computed totals A1:L2 (dollar rate, gold/silver gram rates, per-class totals native + EGP, Total EGP, Credit, Total of All); short-term liabilities list I3:J10 (incl. Arabic names such as "فرش") | J4:J10 liability amounts |
| Installments | Schedule A2:E57 (Name, Due Date, Amount EGP, Type, Paid? Yes/No); summary G1:H10 (total scheduled/paid/remaining, next due date + amount, due next 3/6/12 months, overdue count) | E column ("Paid?") only |
| Investment | Single computed row A1:K2, same scheme as Total but for investment-flagged accounts; D2 is a USD figure displayed with its $ sign | none |
| Rates | B2 USD/EGP, B3 Gold EGP/gram, B4 Silver EGP/gram; C2:C4 "as of" dates | B2:B4; C2:C4 set to today automatically on change |
| Net Worth | Statement A1:B20: assets (liquid EGP/USD/Gold/Silver in EGP, investments, 3× property paid-to-date), total assets, liabilities (short-term, remaining installments), total liabilities, net worth after-all-future and current | B9:B11 (three property paid-to-date cells) only |
| Transactions | Log A:H (Date, Type Income/Expense/Transfer, Category from 13-item list, Account fed from Data!A, Amount, Currency EGP/USD, Amount-EGP computed, Note free text incl. Arabic), blank pre-formatted rows to 500; monthly summary J:N (Month, Income, Expenses, Net Saved, Savings Rate) | Append to first truly empty row, columns A–F and H only; G never written |
| History | Headers A1:G1 (Date, Liquid, Investments, Property Paid, Short-term Liab., Remaining Installments, Net Worth); row 2 live formula row; row 3 "SNAPSHOTS ↓" marker; rows 4+ static snapshots | Append-only via the existing snapshot action (copies current computed values as static values to next empty row) |

**Installment status rules** (must match the sheet's conditional formatting on
the same day): green = Paid is "Yes"; red = "No" and due date before today;
amber = "No" and due within the next 3 months; neutral otherwise.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Glanceable Financial Snapshot (Priority: P1)

The owner opens the app on their phone and immediately sees their current net
worth, total assets, liquid funds, investments, the next installment due (with
a countdown), and the overdue count — plus a donut chart of asset mix and a
bar chart of unpaid installments by year. On a revisit, the last-known figures
render instantly from the session cache while fresh data loads.

**Why this priority**: This is the daily habit loop and the reason the app
exists — replacing "open Sheets app, pinch-zoom, hunt for cells" with an
at-a-glance answer. It is also a viable read-only MVP on its own.

**Independent Test**: Open the app cold, verify every Home figure equals the
corresponding Dashboard-tab cell in the sheet; revisit and verify figures
appear before any network round-trip completes.

**Acceptance Scenarios**:

1. **Given** the sheet contains current data, **When** the owner opens the app cold, **Then** the Home screen shows all KPI cards, the asset-mix donut, and the unpaid-by-year bars, each matching the sheet's Dashboard tab exactly, within 4 seconds.
2. **Given** the owner opened the app earlier this session, **When** they reopen it, **Then** cached figures render within 1 second and a background refresh follows.
3. **Given** the sheet reports overdue installments > 0, **When** the Home screen renders, **Then** the overdue count is highlighted red.
4. **Given** the next installment is N days away, **When** Home renders, **Then** the next-due card shows the due date, amount, and a countdown badge.

---

### User Story 2 - Log a Transaction in Seconds (Priority: P2)

Standing in a shop, the owner taps once from Home to reach the Add screen,
where Expense is preselected, the date defaults to today, categories are
one-tap chips, and the amount field brings up a numeric keypad. Submitting
shows the transaction immediately (optimistic) with a toast; the entry lands
in the sheet's Transactions tab as a real date and real number so the sheet's
own EGP-conversion and monthly-summary formulas compute. The 10 most recent
transactions are listed below the form with type-colored amounts.

**Why this priority**: The flagship write action — the single most frequent
task and the reason the app must be phone-first.

**Independent Test**: Log an expense end-to-end and verify the sheet's
Transactions row, computed EGP column, and monthly summary all reflect it.

**Acceptance Scenarios**:

1. **Given** the Add screen is open, **When** the owner taps a category, enters an amount, and submits, **Then** the entry appears in the recent list immediately and a success toast confirms the sheet write.
2. **Given** a transaction was submitted, **When** the sheet is inspected, **Then** the new row occupies the first truly empty log row with a real date, valid type/category/account/currency values, a real number amount, the note preserved (including Arabic text), and the computed EGP column untouched by the app yet correctly calculated by the sheet.
3. **Given** the sheet write fails, **When** the failure is detected, **Then** the optimistic entry is rolled back and an error toast explains that the entry was not saved.
4. **Given** a practiced owner, **When** they log a cash expense, **Then** the whole flow takes under 10 seconds and at most 3 taps from Home to submit (excluding amount digits).

---

### User Story 3 - Mark an Installment Paid (Priority: P3)

On payday, the owner opens the Installments screen, sees all scheduled
installments grouped by status (overdue first, then due-soon, upcoming, and
paid collapsed) with the same colors the sheet uses, taps this month's NOOR
row, confirms, and the row flips to paid immediately. The dashboard's
overdue/remaining figures update on next refresh.

**Why this priority**: Second most frequent write; the status view alone also
replaces a monthly manual sheet ritual.

**Independent Test**: Mark one unpaid installment paid and verify the sheet's
Paid? cell reads "Yes" and the summary figures recompute.

**Acceptance Scenarios**:

1. **Given** the Installments screen, **When** it renders, **Then** every row's status color matches the sheet's conditional-format rules for the same data on the same day, and the summary card mirrors the sheet's summary block.
2. **Given** an unpaid installment, **When** the owner taps it and confirms, **Then** the row turns paid optimistically and the sheet's Paid? cell is set to "Yes" — exactly two taps from the list.
3. **Given** an already-paid installment, **When** the owner taps it, **Then** no confirm dialog offers to mark it paid again.
4. **Given** the write fails, **When** the failure is detected, **Then** the row reverts to unpaid with an error toast.

---

### User Story 4 - Update Exchange & Metal Rates (Priority: P4)

The owner opens the Rates screen, sees the three editable rate fields
(USD/EGP, gold EGP/gram, silver EGP/gram) styled as editable inputs with
their "as of" dates, changes a rate, and saves. The as-of date is set to
today automatically, and after refresh every EGP-converted figure in the app
matches the sheet's own recomputation.

**Why this priority**: Rates drive every converted figure; updating them is a
frequent small task currently requiring careful cell navigation.

**Independent Test**: Change the USD rate in the app and verify the sheet
cell, the auto-set as-of date, and the recomputed EGP totals all agree.

**Acceptance Scenarios**:

1. **Given** the Rates screen, **When** the owner saves a changed rate, **Then** the corresponding rate cell is updated and its as-of date is set to today without the owner entering a date.
2. **Given** a rate was changed, **When** the app refreshes its data, **Then** every EGP-converted figure shown anywhere in the app equals the sheet's recomputed value.

---

### User Story 5 - Maintain Accounts, Liabilities & Property Inputs (Priority: P5)

The owner reviews all accounts with balances (investment-flagged accounts
badged), taps an account to update its amount, or adds a new account with
name, category, investment flag, amount, and date. They can likewise update
the seven short-term liability amounts and the three property paid-to-date
values. Every one of these editable fields is visually yellow-tinted; nothing
else on those screens is editable.

**Why this priority**: Completes input parity with the sheet's yellow cells —
less frequent than transactions but required for the app to fully stand in
for direct sheet editing.

**Independent Test**: Edit one account amount, add one account, edit one
liability, edit one property value; verify each lands in exactly the intended
cell and nothing else changed.

**Acceptance Scenarios**:

1. **Given** the Accounts screen, **When** the owner edits an amount and saves, **Then** only that account's amount cell changes in the sheet.
2. **Given** the add-account flow, **When** the owner submits a new account, **Then** a complete new row (name, category, investment flag, amount, date) appears after the last existing account row, and the account becomes available in the transaction form's account list after refresh.
3. **Given** the Total & Investment screen, **When** the owner edits a short-term liability amount, **Then** only that liability's amount cell changes; all computed totals remain formula-driven by the sheet.
4. **Given** the Net Worth screen, **When** the owner edits a property paid-to-date value, **Then** only that cell changes and the rest of the statement stays read-only.

---

### User Story 6 - Switch to Arabic with Real RTL (Priority: P6)

The owner switches the UI language to Arabic in Settings. Every screen flips
to a correct right-to-left layout — navigation, forms, tables, lists, and
chart legends mirror properly. Numbers stay Latin digits formatted #,##0 and
dates stay mm/dd/yyyy. Mixed-direction content (Arabic account names like
"فرش" inside English UI and English names inside Arabic UI) renders without
garbling. The preference persists across visits.

**Why this priority**: Bilingual support is a constitutional requirement, but
the app is fully usable in English while it's being completed.

**Independent Test**: Toggle to Arabic and walk all 10 screens against the
RTL checklist; toggle back and re-verify LTR.

**Acceptance Scenarios**:

1. **Given** the app in English, **When** the owner switches to Arabic, **Then** all visible text renders in Arabic from the shared dictionary and the layout direction flips right-to-left on every screen, without reload of data.
2. **Given** Arabic mode, **When** any numeric or date value renders, **Then** it uses Latin digits, #,##0 number formatting, and mm/dd/yyyy dates.
3. **Given** either language, **When** a value in the opposite script appears (account names, notes), **Then** it renders correctly isolated, not reordered or broken.
4. **Given** the owner chose Arabic, **When** they return in a new browser session, **Then** the app opens in Arabic.

---

### User Story 7 - Take a Net-Worth Snapshot & See History (Priority: P7)

At month-end, the owner opens the History screen, sees the table of past
snapshots and a line chart of net worth over time, and taps "Take snapshot".
The current computed figures are appended as a new static snapshot row, and
the chart immediately includes the new point.

**Why this priority**: Monthly cadence; builds on everything else and reuses
the sheet's existing snapshot logic.

**Independent Test**: Take a snapshot and verify a new static row appears
after the last snapshot in the sheet and as a new point on the chart.

**Acceptance Scenarios**:

1. **Given** the History screen, **When** it renders, **Then** it lists all snapshot rows and charts net worth over time from them.
2. **Given** the owner taps "Take snapshot" and confirms, **Then** one new row of static values (no live formulas) is appended after the last snapshot, matching the live computed row's current values, and appears in the chart.

---

### User Story 8 - Browse Everything the Sheet Knows (Priority: P8)

The owner browses the full transaction log filtered by month, type, or
category with monthly summary cards on top; views the Total & Investment
read-only mirrors (per-class totals, the investment row as cards with its USD
figure keeping its $ format); and uses Settings to refresh data, open the
underlying Google Sheet directly, and read about the app.

**Why this priority**: Completes 100% read parity with all 9 tabs; pure
convenience views over data already fetched.

**Independent Test**: For each figure on these screens, verify equality with
the corresponding sheet cell; verify filters narrow the list correctly.

**Acceptance Scenarios**:

1. **Given** the Transactions screen, **When** the owner filters by a month, type, or category, **Then** only matching entries show and the monthly summary cards mirror the sheet's summary table.
2. **Given** the Total & Investment screen, **When** it renders, **Then** all totals match the sheet, and the investment USD figure displays with its $ sign and two decimals.
3. **Given** Settings, **When** the owner taps refresh, **Then** the full app state is re-fetched and all screens update; **When** they tap the sheet link, **Then** the Google Sheet opens.

---

### Edge Cases

- **Write failure after optimistic update**: any failed write (network drop, server rejection) must roll the UI back to its pre-write state and show an error toast; the cache must not retain the failed value.
- **Concurrent edits in the sheet itself**: the owner may edit the sheet directly while the app holds a cached state. The app never merges — refresh always replaces the whole cached state with the sheet's truth; appends target the first truly empty row as determined at write time on the server, not from the client's cache.
- **Transaction log approaching capacity**: the log has pre-formatted rows to 500. When no empty pre-formatted row remains, the append must fail safely with a clear message telling the owner to extend the sheet — never overwrite the summary columns or write outside the log.
- **Row-count drift**: accounts (~17) and installments (56) counts change over time; all reads and writes must locate rows dynamically. A new account row must land after the real last account, even if that differs from the audited count.
- **All installments paid / none overdue**: grouped sections render empty states gracefully; overdue highlight only appears when count > 0.
- **Stale cache on a new day**: installment status colors depend on "today"; statuses must be computed against the current date at render time, not frozen into the cache.
- **Invalid input**: non-numeric or negative-where-nonsensical amounts, missing required transaction fields, and empty rate values are rejected client-side before any write, with the reason shown.
- **Offline / no connectivity**: the app does not work offline by design; a failed initial load with no cache shows a clear "can't reach your sheet" state with a retry, never a blank screen.
- **Unexpected sheet structure**: if a required tab or header is missing or renamed, the load fails with an explicit error naming what was expected, rather than showing wrong numbers.
- **Snapshot double-tap**: rapid repeated snapshot taps must not create duplicate rows for the same action (button disabled while a snapshot is in flight; confirm dialog precedes it).

## Requirements *(mandatory)*

### Functional Requirements

**Data truth & read parity**

- **FR-001**: The app MUST use the owner's existing Google Sheet as its only canonical data store; no figure shown may originate anywhere else, and the sheet MUST remain fully usable on its own if the app is never opened again.
- **FR-002**: The app MUST provide read parity with all 9 tabs per the Data Contract table: every value listed there is viewable in the app and equal to the sheet's value as of the last refresh.
- **FR-003**: All reads and writes MUST locate data ranges dynamically (headers/markers/first-empty-row discovery), never assuming the audited row counts.
- **FR-004**: The full app state MUST be fetched as one aggregated payload in a single backend call; no screen may trigger its own separate load call during normal navigation.

**Write safety (allowlist)**

- **FR-005**: The backend MUST define a single server-side allowlist of writable ranges: Data amounts column (row 2 down) plus complete new account rows; Total liability amounts J4:J10; Installments Paid? column E2:E57 (extent discovered dynamically); Rates B2:B4 with C2:C4 auto-dated; Net Worth B9:B11; Transactions append to columns A–F,H of the first truly empty log row; History append via the snapshot action only.
- **FR-006**: Every write request MUST be validated server-side against that allowlist and MUST throw a server-side error for any target outside it; formulas, computed cells (including Transactions column G), headers, and summary blocks are never written under any circumstance.
- **FR-007**: Appended transactions MUST land with correct value types — a real date value, a real numeric amount, and dropdown-valid type/category/account/currency values — so the sheet's existing formulas (EGP conversion, monthly summary) compute without manual fixes.
- **FR-008**: Changing any rate MUST atomically set that rate's as-of date to today.
- **FR-009**: The snapshot action MUST reuse the sheet's existing snapshot logic: copy the live computed row's current values as static values into the next empty snapshot row, and do nothing else.

**Screens & interaction**

- **FR-010**: The app MUST provide 10 screens — Home/Dashboard, Add Transaction, Transactions list, Installments, Accounts, Rates, Net Worth, Total & Investment, History, Settings — reachable via a bottom navigation bar with Home, Add, Installments, and More (More containing the rest).
- **FR-011**: Home MUST show KPI cards (net worth, total assets, liquid, investments, next installment due with countdown badge, overdue count red-highlighted when > 0), a donut chart of asset mix, and a bar chart of unpaid installments by year, all from sheet data.
- **FR-012**: Add Transaction MUST be reachable in one tap from Home and present: type toggle with Expense preselected, one-tap category chips, account selector fed from the accounts list, a numeric-keypad-friendly amount input, EGP/USD currency toggle, optional note accepting Arabic text, and date defaulting to today; below the form, the 10 most recent transactions with type-colored amounts.
- **FR-013**: Every daily action — add a transaction, mark an installment paid, update a rate — MUST complete in 3 taps or fewer from the home screen (excluding character entry); all touch targets MUST be at least 44px.
- **FR-014**: The Installments screen MUST group rows overdue-first, then due-soon, then upcoming, with paid collapsed; reproduce the sheet's status colors per the stated rules evaluated against the current date; and mark an installment paid via tap → confirm dialog (two taps total from the list).
- **FR-015**: The Transactions screen MUST filter by month, type, and category, and show the sheet's monthly summary as cards.
- **FR-016**: Writes MUST be optimistic: the UI reflects the change immediately, a success toast confirms persistence, and on failure the UI rolls back with an error toast.
- **FR-017**: A manual refresh (pull-to-refresh and/or refresh button, plus the Settings refresh action) MUST re-fetch the full state and replace the cache; there is no automatic background polling.

**Performance & caching**

- **FR-018**: The client MUST cache the last full state for the browser session only and render from it instantly on revisit; session cache and the language preference are the only client-side persistence, and neither is ever treated as a source of record.
- **FR-019**: Cold load MUST complete (data visible) in ≤ 4 seconds; a cached revisit MUST render figures in ≤ 1 second.

**Bilingual & formatting**

- **FR-020**: All UI strings MUST come from one dictionary with English and Arabic translations; no hardcoded display text.
- **FR-021**: Switching to Arabic MUST flip the entire layout to right-to-left — navigation, forms, tables, lists, and chart legends — and the choice MUST persist across sessions as a local preference.
- **FR-022**: Numbers MUST render as Latin digits formatted #,##0 in both languages (the investment USD figure keeps its $#,##0.00 format); dates MUST render mm/dd/yyyy in both languages.
- **FR-023**: Mixed-direction text (Arabic names in English UI and vice versa) MUST render correctly via direction isolation, in labels, lists, dropdowns, and notes.

**Visual language**

- **FR-024**: The app MUST use the sheet's palette: navy #1F3864 headers/navigation, blue #2E75B6 accents, yellow #FFF2CC on every editable field, and green #E2EFDA / amber #FFF3CD / red #FCE4E4 for installment paid/due-soon/overdue status.
- **FR-025**: Every editable control MUST be visually yellow-tinted and every read-only figure MUST NOT be, so editability is recognizable at a glance on every screen.

**Scope honesty**

- **FR-026**: The app MUST NOT implement offline mode or a service worker; it MUST support an "Add to Home Screen" shortcut experience instead, and the README MUST state this limitation plainly.
- **FR-027**: The app is single-user: only the sheet's owner can access it; no accounts, sharing, or third-party services are involved, and no analytics or telemetry is collected.

### Key Entities

- **App State Payload**: the complete snapshot of all readable sheet data delivered in one fetch — dashboard KPIs, asset mix, unpaid-by-year, accounts, totals, liabilities, installments + summary, investment row, rates, net-worth statement, transactions + monthly summaries, history snapshots.
- **Account**: name, category (USD/EGP/Gold/Silver/Liability), investment flag, amount (editable), date. Feeds the transaction form's account list.
- **Transaction**: date, type (Income/Expense/Transfer), category (13 fixed values), account, amount, currency (EGP/USD), computed EGP amount (sheet-owned), optional note (may be Arabic). Append-only from the app.
- **Installment**: name, due date, amount (EGP), type, paid flag (the only app-editable attribute); derived status (paid/overdue/due-soon/upcoming) computed from paid flag + due date vs. today.
- **Rate**: one of USD/EGP, gold EGP/gram, silver EGP/gram; value (editable) + as-of date (auto-set).
- **Short-term Liability**: named amount (editable), list of 7 including Arabic-named entries.
- **Net Worth Statement**: ordered assets/liabilities lines with totals; three property paid-to-date lines editable, all else sheet-computed.
- **Snapshot**: dated static copy of the seven history columns; append-only via the snapshot action.
- **Monthly Summary**: sheet-computed month/income/expenses/net-saved/savings-rate rows, read-only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a revisit, the owner sees current net worth and the next installment due within 2 seconds of opening the app, without any input.
- **SC-002**: A practiced owner logs a cash expense in under 10 seconds, and the sheet's transaction log and monthly summary reflect it correctly with no manual sheet fix-up.
- **SC-003**: Marking an installment paid takes exactly two taps from the installments list, and dashboard overdue/remaining figures match the sheet after refresh.
- **SC-004**: After a rate update in the app, 100% of EGP-converted figures shown in the app equal the sheet's recomputed values.
- **SC-005**: Zero writes land outside the allowlisted input ranges — verified by attempting writes to a formula cell, a header, and the computed EGP column, all rejected server-side — and no formula in any tab is ever altered by app use.
- **SC-006**: Installment status colors in the app match the sheet's conditional formatting for 100% of rows on the same day.
- **SC-007**: Cold load shows live data in ≤ 4 seconds via a single data fetch; cached revisit renders in ≤ 1 second.
- **SC-008**: All 10 screens pass a manual bilingual checklist (kept in the repo) in both English/LTR and Arabic/RTL, including mixed-direction names, with numbers and dates format-stable.
- **SC-009**: A month-end snapshot appears as a new static row and a new chart point immediately after the action.
- **SC-010**: In an audit of every screen, 100% of editable controls are yellow-tinted and 0% of read-only figures are.
- **SC-011**: With the app never opened, the sheet's every existing workflow (manual edits, formulas, conditional formats, existing snapshot menu) works unchanged.

## Assumptions

- Single user: the sheet's owner is the only user; the deployment is restricted to the owner's own Google account, so no additional sign-in flow or role model is needed.
- The audited structure (tab names, column meanings, header rows, dropdown value lists, yellow-cell conventions) is stable; only row counts drift. Structural changes to the sheet are out of scope and should fail loudly, not silently.
- The sheet's existing snapshot logic is present and correct; the app invokes the same behavior rather than reimplementing it.
- Online-only usage is acceptable per the constitution's Honest Scope principle; there is no offline requirement.
- The language preference persisted locally is a UI preference, not canonical data, and is explicitly permitted.
- "3 taps" budgets count discrete tap targets (nav, chips, toggles, submit, confirm) and exclude typing digits/characters into a focused field.
- Dates entered and displayed use the owner's local timezone; "today" for installment status, transaction default date, and rate as-of dates means the current date where the owner is.
- Amount edits accept the same value domain the sheet accepts today (e.g., liabilities may legitimately be entered as positive amounts owed); the app does not impose business rules the sheet doesn't have beyond basic numeric validity.
- The charts (asset-mix donut, unpaid-by-year bars, net-worth line) visualize data already present in the fetched state; no new derived analytics are introduced in v1.
