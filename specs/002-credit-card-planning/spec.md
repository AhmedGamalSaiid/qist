# Feature Specification: Credit Card Payments & Monthly Cash-Flow Planning

**Feature Branch**: `002-credit-card-planning`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Add a feature for managing and planning Credit Card (CC) payments across four cards (ADIB CC, HSBC CC, CASHBACK CC, Valu CC), integrated with the existing Installments feature, with a monthly financial planning view that combines recurring salary income, credit-card payments and installments, and that is aware of cash-flow timing (payment due dates vs. salary date), showing totals, remaining balance, shortage, and how much money must be prepared before upcoming due dates."

---

## Overview

Today the app answers "what do I owe overall?" (Net Worth, Totals) and "what
installment is next?" (Installments). It cannot answer the question the owner
actually asks at the end of every month: **"Between now and my next salary, do I
have enough money, and if not, how much do I need to find?"**

This feature adds two things:

1. **Credit-card payment obligations** — a second kind of dated, scheduled
   obligation alongside installments, tracked per card.
2. **Monthly Plan** — a per-month view that merges every obligation (credit
   cards + installments) with expected income (recurring salary) into one dated
   timeline, and evaluates it both as a monthly total **and** as a running
   balance ordered by date, so a positive monthly balance never hides a payment
   the owner cannot fund on the day it is due.

The feature is strictly additive: installments keep working exactly as they do
now, and every existing installment figure keeps its current meaning.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record what each credit card needs paid, and when (Priority: P1)

The owner receives a statement from ADIB and knows 1,000 EGP is due on 25/08.
He opens the app, picks the card, enters the amount and due date, and saves. The
payment now appears in a per-card list showing everything owed on that card,
grouped by month, with each entry's amount, due date and status.

**Why this priority**: Nothing else in the feature can exist without the
obligations being recorded. On its own it already replaces the mental note /
paper reminder the owner uses today, and it delivers the "how much do I owe on
each card and when?" answer immediately.

**Independent Test**: Add payments for two different cards in two different
months, reopen the app, and confirm each card shows its own payments with the
correct amounts, due dates and month grouping — with no other part of the app
changed.

**Acceptance Scenarios**:

1. **Given** the owner is on the Credit Cards screen, **When** he adds "ADIB CC,
   1,000 EGP, due 25/08/2026", **Then** the payment appears under ADIB CC in the
   August 2026 group with status Pending, and the app total for August rises by
   1,000 EGP.
2. **Given** an ADIB payment exists for August and an HSBC payment for
   September, **When** the owner views the Credit Cards screen, **Then** each
   card lists only its own payments and each payment is grouped under the month
   it belongs to.
3. **Given** the owner is adding a payment, **When** he leaves the amount blank
   or enters zero/negative, **Then** the payment is rejected with a clear
   message and nothing is saved.
4. **Given** a Pending payment that has been settled, **When** the owner marks it
   Paid, **Then** its status changes to Paid without asking for a source account
   or any other input, it stops counting as money still to be paid, and the
   change survives a refresh.
4a. **Given** a payment marked Paid by mistake, **When** the owner toggles it back,
   **Then** it returns to Pending — or Overdue if its due date has passed — and
   counts as money still to be paid again.
4b. **Given** any payment is marked Paid, **When** the owner checks the
   transaction log and every account balance, **Then** neither has changed.
5. **Given** the owner adds an optional note to a payment, **When** he views the
   payment later, **Then** the note is shown with it.

---

### User Story 2 - See one dated timeline of everything due in a month (Priority: P1)

For any month the owner sees a single, chronologically ordered list of every
obligation — credit-card payments and installments together — plus the month's
total. For August: `25/08 → ADIB CC 1,000 EGP`, `27/08 → Installment 1,000 EGP`,
total 2,000 EGP.

**Why this priority**: The whole point of recording card payments is to see them
next to the installments they compete with. Total-plus-timeline is the minimum
that answers "how much this month, and on which days?".

**Independent Test**: With one card payment and one installment in the same
month, confirm the month view shows both entries in date order, labelled by
source, with a correct combined total — and confirm the existing Installments
screen still shows the same numbers it did before.

**Acceptance Scenarios**:

1. **Given** August holds an ADIB payment of 1,000 EGP due 25/08 and an
   installment of 1,000 EGP due 27/08, **When** the owner opens the August plan,
   **Then** total obligations show 2,000 EGP and the timeline lists 25/08 ADIB CC
   1,000 then 27/08 Installment 1,000, in that order.
2. **Given** the same month, **When** the owner looks at the breakdown, **Then**
   credit cards (1,000) and installments (1,000) are shown as separate subtotals
   that sum to the month total.
3. **Given** several obligations fall on the same date, **When** the timeline is
   rendered, **Then** they appear as separate entries under one date heading and
   both are counted once each in the total.
4. **Given** a month with no obligations at all, **When** the owner opens it,
   **Then** the month shows zero obligations and an explicit empty state rather
   than a blank screen.
5. **Given** the Installments screen and the sheet's installment summary before
   this feature, **When** credit-card payments are added, **Then** installment
   totals, "Remaining Installments", "Due Next 12 Months" and the unpaid-by-year
   figures are numerically unchanged.

---

### User Story 3 - Know the month's income, remainder and shortage (Priority: P2)

The owner's salary of $2,250 arrives on the 27th of every month. The monthly plan
shows expected income for the month, total obligations, what remains after them,
and — if obligations exceed what is available — the shortage amount.

**Why this priority**: Turns a list of obligations into a verdict. It needs
US1 + US2 in place, but once present the owner can answer "will I be OK this
month?" without arithmetic.

**Independent Test**: Configure the recurring salary, then open a month whose
obligations are smaller than income and a month whose obligations are larger, and
confirm the first reports a surplus and the second reports a shortage of exactly
the difference.

**Acceptance Scenarios**:

1. **Given** a recurring salary of $2,250 on the 27th, **When** the owner opens
   any month, **Then** that month shows expected income including the salary,
   converted to EGP at the app's current USD rate and labelled with both the
   original $2,250 and the converted figure.
2. **Given** September holds an HSBC payment of 3,000 EGP and installments of
   4,000 EGP, **When** the owner opens September, **Then** total obligations show
   7,000 EGP, split as credit cards 3,000 and installments 4,000.
3. **Given** a month where total obligations exceed total income plus opening
   balance, **When** the owner opens it, **Then** a shortage is shown equal to the
   difference, presented as the amount that must be covered.
4. **Given** a month where income comfortably exceeds obligations, **When** the
   owner opens it, **Then** the remaining balance after obligations is shown as a
   surplus and no shortage is reported.
5. **Given** the USD rate is changed in the app, **When** the owner returns to a
   monthly plan, **Then** the salary's EGP value and every derived total reflect
   the new rate.

---

### User Story 4 - Know what to prepare before the salary lands (Priority: P2)

August's salary arrives on 27/08 but ADIB is due on 25/08. Even though the month
as a whole is comfortably positive, the owner must have 1,000 EGP on hand two
days earlier. The plan says so explicitly: it walks the month day by day and
reports the largest deficit that occurs before income arrives, as "amount to
prepare".

**Why this priority**: This is the requirement that distinguishes this feature
from a spreadsheet sum. It is P2 only because it depends on US2 and US3 existing
first; in value terms it is the reason the feature is being built.

**Independent Test**: With the Total tab's "Total of All in EGP" below the amount
of an obligation dated before the salary date and confirm the plan reports a timing shortfall and an
"amount to prepare" equal to the gap, while still reporting a positive
end-of-month balance.

**Acceptance Scenarios**:

1. **Given** an opening balance of 400 EGP (the Total tab's "Total of All in
   EGP"), an ADIB payment of 1,000 EGP due 25/08
   and salary on 27/08, **When** the owner opens August, **Then** the plan warns
   that 25/08 cannot be covered and states 600 EGP must be prepared before that
   date — while still showing a positive end-of-month balance.
2. **Given** the same month with an opening balance of 1,500 EGP, **When** the owner
   opens August, **Then** no timing warning appears and the plan confirms every
   payment is covered on its due date.
3. **Given** two obligations before the salary date that together exceed
   the opening balance, **When** the plan is computed, **Then** the amount to prepare
   is the largest cumulative deficit reached before the income date, not the sum
   of the two payments.
4. **Given** an obligation already marked Paid, **When** the cash-flow walk runs,
   **Then** that obligation does not reduce the running balance again.
5. **Given** a month whose obligations are all dated after the salary date,
   **When** the plan is computed, **Then** no "prepare before" amount is reported
   even if the opening balance is currently zero.
6. **Given** any month's plan, **When** the owner views it, **Then** the opening
   balance is shown and labelled as the Total tab's "Total of All in EGP", so the
   verdict can be traced to its input.

---

### User Story 5 - Look ahead across the coming months (Priority: P3)

The owner scans a compact table of upcoming months — income, credit cards,
installments, total obligations, remaining or shortage per month — and taps any
row to open that month's full dated timeline.

**Why this priority**: Planning value beyond the current month, but the current
month is where decisions actually get made. Useful, not urgent.

**Independent Test**: With obligations entered across three future months,
confirm the forecast table shows one row per month with correct per-category
subtotals, and that tapping a row opens that month's timeline.

**Acceptance Scenarios**:

1. **Given** obligations exist in the next three months, **When** the owner opens
   the forecast, **Then** each month appears as its own row with income, credit
   cards, installments, total obligations and remaining/shortage.
2. **Given** the forecast table, **When** the owner taps a month row, **Then**
   that month's detailed timeline opens.
3. **Given** a future month with a projected shortage, **When** the forecast is
   rendered, **Then** that row is visually marked as a shortage month.
4. **Given** a month beyond every entered obligation, **When** it appears in the
   forecast, **Then** it shows the recurring salary and only the obligations that
   have actually been entered, labelled as a projection based on entered data.

---

### User Story 6 - Answer "what's next?" at a glance from Home (Priority: P3)

The Home screen gains a compact summary: total due this month, the nearest
upcoming payment (which card or installment, how much, on what date), and a
shortage warning when the current month has one.

**Why this priority**: A convenience surface over data US1–US4 already produce.
Valuable for daily use, trivially removable without harming the feature.

**Independent Test**: With current-month obligations entered, confirm Home shows
the correct month total and correctly identifies the nearest unpaid obligation,
and that the warning appears only when a shortage or timing gap exists.

**Acceptance Scenarios**:

1. **Given** unpaid obligations in the current month, **When** the owner opens
   Home, **Then** the total due this month and the nearest unpaid obligation
   (source, amount, date) are shown.
2. **Given** the current month has a timing shortfall, **When** Home is
   rendered, **Then** a shortage indicator appears with the amount to prepare and
   opens the monthly plan when tapped.
3. **Given** every obligation this month is Paid, **When** Home is rendered,
   **Then** the nearest payment points to the next unpaid obligation in a later
   month, or states there is none.

---

### Edge Cases

- **Due day that does not exist in a month** (e.g. a 31st due day in a 30-day
  month, or a 29th in a non-leap February): the obligation lands on the last day
  of that month; the same rule applies to the recurring salary day.
- **Past-due unpaid obligations**: an obligation whose due date has passed and is
  still Pending is flagged Overdue, stays visible in the current-month view, and
  is treated as money still to be paid — but it is not silently re-dated into the
  current month; its original due date is preserved.
- **Payment belonging to a different month than its due date** (statement for
  August, due 02/09): the month the payment belongs to and the date it must be
  paid are recorded separately; monthly totals group by due date, and the
  statement month is shown as context.
- **Salary date lands on a weekend or holiday**: the app uses the stated day
  as-is; it does not shift for banking days.
- **USD rate missing, zero or stale**: income in a foreign currency cannot be
  converted; the plan shows income as unavailable and prompts the owner to set the
  rate rather than silently treating it as zero.
- **Opening balance zero or unreadable**: if the Total tab's "Total of All in
  EGP" is zero, blank or unreadable, the plan still computes monthly totals and
  the dated timeline; the timing verdict is presented as "based on 0 available"
  and labelled as such rather than being hidden.
- **Opening balance moves while a plan is open**: because the balance is a live
  figure driven by account, liability and rate values, the plan reflects whatever
  the figure was at the last data refresh, and shows that as-of moment alongside
  it.
- **A payment is marked Paid but the sheet is not yet updated**: the obligation
  stops reducing the running balance while the opening balance still contains the
  money — the plan will read optimistically until the account figure is corrected
  (A-005a). No automatic adjustment is made.
- **Obligations exceeding several months of income**: shortages are reported per
  month; a month's closing balance may be negative, and that negative balance
  carries into the next projected month rather than being reset to zero.
- **Two obligations on the same date, one of which is Paid**: only the Pending
  one affects the running balance; both are listed.
- **Duplicate entry** (same card, same amount, same due date added twice): the
  app warns about the apparent duplicate but does not block it — real duplicates
  can legitimately exist.
- **A card with no payments recorded**: the card still appears with an explicit
  "nothing due" state.
- **Editing or deleting an obligation after it was marked Paid**: allowed only
  through an explicit correction path, and it must never leave the running
  balance describing money that was never actually spent.
- **Forecast horizon boundary**: obligations dated beyond the forecast horizon
  are excluded from the month table but must still be counted in any "total
  outstanding" figure the feature shows.
- **A further card** added later: it appears everywhere cards are listed without
  any change to the existing four.
- **A Valu payment also present in the installment schedule**: Valu's obligations
  are called instalments by the provider, so the same payment could plausibly be
  entered both as a Valu CC payment and as a row in the existing installment
  schedule. The app MUST count each obligation once (BR-012); where a
  credit-card payment and an installment share a due date and amount, the app
  warns about the apparent double entry without blocking it.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Credit cards and their payments

- **FR-001**: System MUST support a set of named credit cards, pre-populated with
  ADIB CC, HSBC CC, CASHBACK CC and Valu CC, and MUST allow additional cards to
  be introduced later without redesigning the feature.
- **FR-002**: System MUST treat Valu CC exactly like any other card. Its
  obligations are typically monthly instalment payments; each one is recorded as
  an ordinary credit-card payment with its own amount and due date (D-002), and
  it appears in the same per-card list, the same monthly timeline and the same
  credit-card subtotal as every other card.
- **FR-003**: Users MUST be able to record a credit-card payment obligation
  consisting of: card, amount, due date, the month/year the payment belongs to,
  status, and an optional note. Every payment is entered manually, one at a
  time; amount and due date vary month to month and are always typed by the
  owner.
- **FR-004**: System MUST support any number of payment obligations per card and
  per month, including several obligations for the same card in the same month.
- **FR-005**: System MUST reject a payment whose amount is not a positive number,
  whose due date is missing or unparseable, or whose card is not a known card.
- **FR-006**: System MUST default the "belongs to" month to the month of the due
  date when the user does not state otherwise.
- **FR-007**: Users MUST be able to toggle a payment's status between Pending
  and Paid in both directions, with no other input required — no source account,
  no payment method, no amount confirmation.
- **FR-008**: Marking a payment Paid MUST NOT create a transaction-log entry,
  deduct from any account, or alter any account balance. It changes that
  payment's status and nothing else.
- **FR-009**: System MUST show each payment's status as Pending, Paid, or
  Overdue, where Overdue is derived from an unpaid payment whose due date has
  passed, using the same status vocabulary and colour grammar as installments.
- **FR-010**: Users MUST be able to see all payments for one card, grouped by
  month, with amounts, due dates, statuses and notes.
- **FR-011**: System MUST show a per-card total of what is still to be paid.
- **FR-012**: System MUST allow a recorded payment to be corrected or removed
  through an explicit action, and MUST make the resulting change visible in every
  total that included it.

#### Income

- **FR-013**: System MUST support a recurring monthly salary defined by amount,
  currency and day-of-month, initially $2,250 (USD) on day 27.
- **FR-014**: Users MUST be able to change the salary amount, currency and day.
- **FR-015**: System MUST project the recurring salary into every month in the
  planning horizon, including future months with no other data.
- **FR-016**: System MUST convert non-EGP income to EGP using the app's current
  USD rate, and MUST display both the original currency amount and the converted
  EGP amount wherever salary is shown.
- **FR-017**: System MUST clearly report when income cannot be converted because
  the rate is unavailable, instead of treating it as zero.

#### Monthly aggregation

- **FR-018**: System MUST produce, for each month in the horizon: total income,
  total credit-card obligations, total installment obligations, total obligations,
  remaining balance after obligations, and shortage amount when applicable.
- **FR-019**: System MUST produce, for each month, a chronologically ordered
  timeline of every individual obligation, each entry showing date, source
  (specific card name or installment name), amount and status.
- **FR-020**: System MUST group obligations into a month by their **due date**.
- **FR-021**: System MUST include installments in monthly totals and timelines by
  reading the existing installment schedule — it MUST NOT require installments to
  be re-entered.
- **FR-022**: System MUST distinguish, in every monthly total, between the total
  obligation for the month (all obligations regardless of status) and the amount
  still to be paid (Pending and Overdue only).
- **FR-023**: System MUST support any additional obligation category introduced
  later without changing how monthly totals are defined.

#### Cash-flow timing

- **FR-024**: System MUST compute a running balance for each month by processing
  income and unpaid obligations in date order, starting from the month's opening
  balance (FR-030).
- **FR-025**: System MUST identify every date on which the running balance would
  go negative, and MUST report the first such date.
- **FR-026**: System MUST report an "amount to prepare" equal to the largest
  deficit reached before the next income date.
- **FR-027**: System MUST report a timing shortfall even when the month's overall
  balance is positive, and MUST present the two as distinct facts.
- **FR-028**: System MUST exclude obligations already marked Paid from the running
  balance.
- **FR-029**: System MUST carry a month's closing balance forward as the opening
  balance of the next month in the forecast, including when that balance is
  negative.
- **FR-030**: System MUST use the existing **"Total of All in EGP"** figure from
  the Total tab as the current month's opening balance, reusing that tab's
  existing calculation without redefining, recomputing or overriding it.
- **FR-031**: System MUST NOT introduce any separate opening-balance input — no
  manually typed starting balance and no per-account "spendable" flag.
- **FR-032**: System MUST display the opening-balance figure it used, labelled as
  the Total tab's "Total of All in EGP", so the timing verdict is auditable.
- **FR-033**: System MUST recompute the plan from the current "Total of All in
  EGP" whenever that figure changes (through account edits, liability edits or
  rate changes).

#### Presentation

- **FR-034**: System MUST provide a monthly plan view showing, for the selected
  month: total due, breakdown by category, expected income, remaining or
  shortage, the nearest upcoming payment, and the dated timeline.
- **FR-035**: Users MUST be able to move between months and reach any month in
  the horizon.
- **FR-036**: System MUST provide a multi-month table with one row per month
  showing income, credit cards, installments, total obligations and
  remaining/shortage, where each row opens that month's timeline.
- **FR-037**: System MUST surface, on the app's home screen, the current month's
  total due, the nearest upcoming payment and a shortage indicator when one
  exists.
- **FR-038**: System MUST visually distinguish shortage months from surplus months.
- **FR-039**: System MUST present all new screens in both English and Arabic with
  correct right-to-left layout, with no user-visible string outside the shared
  translation dictionary, and MUST keep number and date formatting identical to
  the rest of the app.
- **FR-040**: Recording a credit-card payment MUST be completable in three taps
  or fewer from the home screen, with touch targets no smaller than the app's
  existing minimum.

#### Integrity and non-regression

- **FR-041**: System MUST NOT alter any existing installment figure, installment
  summary value, or dashboard indicator as a side effect of adding credit-card
  data.
- **FR-042**: System MUST keep credit-card obligations distinguishable from
  installments in every stored record and every displayed total.
- **FR-043**: All credit-card and income data MUST be stored in the owner's sheet
  as the single source of truth, and the sheet MUST remain independently readable
  and editable for this data without the app.
- **FR-044**: Writes introduced by this feature MUST target only explicitly
  designated input areas and MUST NOT be able to reach any formula, computed cell
  or header under any input.
- **FR-045**: Edits made to credit-card or income data directly in the sheet MUST
  be reflected by the app on its next data refresh.
- **FR-046**: The monthly plan MUST be derived at view time from stored
  obligations, income settings and rates — no computed plan figure may be stored
  as a separate source of truth that can drift.

---

### Business Rules

- **BR-001**: An obligation belongs to the month of its **due date** for all
  totals and timelines. The "belongs to" month is descriptive context only
  (e.g. an August statement paid on 02/09 counts in September's totals and is
  labelled as the August statement).
- **BR-002**: Status is a two-way toggle: Pending ⇄ Paid, freely reversible.
  Overdue is not stored — it is derived at view time from a Pending payment whose
  due date has passed, so toggling Paid off restores Pending or Overdue
  automatically. This differs deliberately from installments, whose paid flag is
  one-way, because a credit-card status carries no side effects to undo.
- **BR-003**: "Total obligations" for a month counts every obligation dated in
  that month regardless of status. "Still to pay" counts only Pending and
  Overdue.
- **BR-004**: Overdue obligations remain attached to their original due date and
  are additionally surfaced in the current month as outstanding.
- **BR-005**: All plan arithmetic is performed in EGP. Foreign-currency income is
  converted at the app's current USD rate at view time; the plan is never stored
  in converted form.
- **BR-006**: A due day greater than the number of days in the target month
  resolves to the last day of that month. The same rule governs the salary day.
- **BR-007**: On the same calendar date, obligations are settled **before**
  income is received. This conservative ordering means an obligation dated the
  same day as the salary must already be funded.
- **BR-008**: The planning horizon is the current month plus the following 11
  months, unless the owner navigates further.
- **BR-009**: Future months always include the recurring salary; they include only
  the obligations actually entered. A future month is therefore a projection, not
  a forecast of unentered spending, and must be labelled as such.
- **BR-010**: Credit-card obligations and installments are never merged into one
  record type. They are aggregated for display and always remain separable.
- **BR-012**: Every obligation is recorded in exactly one place. An obligation
  tracked as a credit-card payment is never also tracked in the installment
  schedule, and vice versa. This matters most for Valu CC, whose payments the
  provider labels "instalments": they belong to the credit-card side of the
  feature, not to the installment schedule, and must never be entered in both.

- **BR-011**: Marking a credit-card payment Paid records the obligation as
  settled; it does not by itself create a spending transaction in the transaction
  log, does not deduct from any account, and never asks which account the money
  came from. Transaction logging stays a wholly separate, manual activity.

---

### Cash-Flow Calculation Rules

Given a month M, an opening balance `B0`, the set of unpaid obligations dated in
M, and the income events dated in M — where `B0` for the current month is the
Total tab's "Total of All in EGP" (D-001, FR-030) and for every later month is
the previous month's closing balance:

1. Build the event list: every unpaid obligation as a negative amount on its due
   date; every income event as a positive amount on its date.
2. Sort events by date ascending. Within one date, apply negative events before
   positive ones (BR-007).
3. Walk the list, maintaining a running balance starting at `B0`.
4. **First shortfall date** = the earliest date at which the running balance is
   negative after applying that date's events. If none, the month has no timing
   problem.
5. **Amount to prepare** = the absolute value of the most negative running balance
   reached at or before the next income event. This is the smallest amount that,
   if added before the first shortfall date, keeps every payment fundable until
   income arrives.
6. **Closing balance** = the running balance after the final event of the month.
7. **Monthly remaining** = `B0 + total income − total obligations still to pay`.
   Equal to the closing balance; reported as a surplus when positive.
8. **Monthly shortage** = `max(0, −monthly remaining)`. A month may have zero
   shortage and still have a non-zero amount to prepare — these are separate
   verdicts and must both be shown.
9. The next month's `B0` is this month's closing balance, negative values
   included.
10. For the current month, only obligations and income dated **today or later**
    are walked; dates already past are treated as settled facts reflected in the
    opening balance.

**Worked example (August 2026)** — opening balance 400 EGP (Total tab's "Total
of All in EGP"), USD rate 48.50:

| Date | Event | Amount (EGP) | Running |
|------|-------|--------------|---------|
| 25/08 | ADIB CC (obligation) | −1,000 | −600 |
| 27/08 | Installment (obligation) | −1,000 | −1,600 |
| 27/08 | Salary $2,250 (income) | +109,125 | +107,525 |

Reported: total obligations 2,000 EGP (cards 1,000 + installments 1,000);
income 109,125 EGP; monthly remaining +107,525 EGP (surplus, no shortage);
first shortfall 25/08; **amount to prepare before 25/08: 1,600 EGP**.

---

### Key Entities

- **Credit Card**: a named card the owner holds (ADIB CC, HSBC CC, CASHBACK CC,
  Valu CC, and any added later). Identity is its name. Carries no balance of its own in
  this feature — only the payments recorded against it.
- **Credit Card Payment**: one dated obligation against one card. Attributes:
  card, amount, currency, due date, statement month/year, status
  (Pending/Paid/Overdue), optional note. Belongs to exactly one card.
- **Installment** *(existing)*: an already-tracked dated obligation with name,
  due date, amount and paid flag. Read, never redefined by this feature.
- **Income Source**: a recurring expected inflow. Initially exactly one — the
  salary: amount, currency, day-of-month. Structured so further sources can be
  added later.
- **Obligation Timeline Entry** *(derived)*: one line of a month's dated
  timeline — date, source type (credit card / installment), source name, amount
  in EGP, status. Never stored.
- **Monthly Plan** *(derived)*: one month's computed summary — opening balance
  (from the Total tab, never entered),
  total income, credit-card total, installment total, total obligations, still to
  pay, closing balance, shortage, first shortfall date, amount to prepare, and the
  ordered timeline. Never stored.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can record a new credit-card payment in 3 taps or fewer
  from the home screen and in under 20 seconds.
- **SC-002**: From opening the app, the owner can state this month's total
  obligations and the date of the next payment within 10 seconds, without opening
  the sheet.
- **SC-003**: For a month containing both credit-card payments and installments,
  the displayed total obligations equals the sum of the individual timeline
  entries, in 100% of checked months.
- **SC-004**: In a month where a payment falls before the salary date and the
  opening balance is insufficient, the app reports the shortfall and the exact
  amount to prepare in 100% of such cases — including when the month's overall
  balance is positive.
- **SC-005**: Every existing installment and dashboard figure is numerically
  identical before and after credit-card data is added — zero regressions.
- **SC-006**: The owner can view income, obligations and remaining/shortage for
  each of the next 12 months without leaving the app.
- **SC-007**: All new screens are fully usable in Arabic with right-to-left
  layout, with zero untranslated user-visible strings.
- **SC-008**: Credit-card payment data entered in the app is visible and editable
  directly in the sheet, and sheet-side edits appear in the app after one refresh,
  in 100% of cases.
- **SC-009**: No user input path can modify a formula, computed cell or header —
  verified by attempting writes outside the designated input areas.
- **SC-010**: Toggling a payment's status is a single tap in both directions and
  leaves the transaction log and every account balance byte-identical, in 100% of
  attempts.
- **SC-011**: The opening balance shown by every monthly plan matches the Total
  tab's "Total of All in EGP" exactly, with no separate stored or entered value
  anywhere in the feature.

---

## Assumptions

- **A-001**: The owner is the sole user; there is no multi-user access, sharing
  or permission model.
- **A-002**: Credit-card payment amounts are entered in EGP. Foreign-currency
  card payments are out of scope for this version.
- **A-003**: The salary is the only income source at launch; the model allows more
  later but no UI is provided to add a second source.
- **A-004**: Salary conversion uses the app's existing USD rate, which the owner
  maintains manually. The plan does not fetch or estimate rates.
- **A-005**: The feature plans obligations only. It does not budget for living
  expenses, and its "remaining balance" therefore means "remaining after
  scheduled obligations", not "free to spend".
- **A-005a**: Because Paid is a status flag with no side effects (D-003), the
  opening balance does not fall when a payment is marked Paid. It falls only when
  the underlying account or liability figures in the sheet change. Between paying
  a card and updating the sheet, the plan will overstate available money by the
  amount just paid.
- **A-006**: Marking a payment Paid does not create a transaction-log entry, ask
  for a source account, or move money anywhere; the owner logs spending
  separately if desired (D-003, BR-011).
- **A-007**: Credit-card statement balances, minimum payments, interest, limits
  and utilisation are out of scope — only the amount the owner decides to pay is
  recorded.
- **A-008**: The four named cards — ADIB CC, HSBC CC, CASHBACK CC and Valu CC —
  are seeded on first use; adding a fifth is a supported data operation, not a
  code change.
- **A-008a**: Valu CC is modelled as a credit card rather than as an installment
  even though its payments are instalments, because the owner manages it
  alongside the other cards and its amounts are entered manually per payment.
  Nothing about the existing installment schedule changes as a result (BR-012).
- **A-009**: The default planning horizon is 12 months (BR-008).
- **A-010**: All new data lives in the owner's existing sheet, following the same
  storage, refresh, caching and optimistic-write behaviour as existing features;
  no new backend or external service is introduced.
- **A-011**: Dates continue to display in the app's existing `mm/dd/yyyy` format
  and amounts in the existing `#,##0` format, in both languages.

---

## Resolved Decisions

Decided by the owner on 2026-08-25. No open questions remain.

- **D-001 — Opening balance is the Total tab's "Total of All in EGP".** The
  cash-flow walk starts from the figure the Total tab already computes, reusing
  its existing logic verbatim. No manually entered opening balance and no
  "spendable accounts" subset are introduced. *(FR-030 – FR-033)*

  **Stated caveat**: "Total of All in EGP" is an all-assets figure — it includes
  gold, silver and USD holdings converted at the current rates, plus Credit. It
  is not cash-on-hand. Where part of that total sits in assets that would not
  realistically be liquidated to pay a card, the timing verdict reads
  optimistically: the app may report a payment as covered when the covering value
  is metal rather than money. This is accepted deliberately for consistency with
  the Total tab; FR-032 requires the figure and its label to be shown so the
  owner can judge it. Revisiting it later means changing one input, not the
  model.

- **D-002 — Credit-card payments are entered manually, one at a time.** For each
  payment the owner types card, amount and due date (status and note optional).
  Amounts and dates vary month to month, so no recurring schedule, no generator
  and no "repeat forward" action is built. *(FR-003)*

- **D-003 — Paid is a status flag only.** The status toggles both ways between
  Pending and Paid, requires no source account, and creates no transaction, no
  deduction and no account-balance change. Transaction logging remains entirely
  separate and manual. *(FR-007, FR-008, BR-011)*

---

## Out of Scope

- Credit-card statement import, bank connections or automatic reconciliation.
- Interest, fees, minimum-payment logic, credit limits and utilisation.
- Budgeting for discretionary or living expenses.
- Multi-currency credit-card payments.
- Recurring or auto-generated credit-card payment schedules — every payment is
  typed in manually (D-002).
- Any new opening-balance input, spendable-account flag or cash-vs-asset split —
  the Total tab's existing figure is used as-is (D-001).
- Automatic expense logging, account deduction or source-account selection when a
  payment is marked Paid (D-003).
- Notifications, reminders or any push/email alerting.
- Editing or restructuring the existing installment schedule.
- Any offline mode or background sync.

---

## Dependencies

- The existing installment schedule, which supplies the installment side of every
  monthly total and timeline.
- The existing USD rate, which converts salary to EGP.
- The Total tab's existing **"Total of All in EGP"** calculation, which supplies
  the cash-flow opening balance unchanged (D-001). Anything that shifts that
  figure — account amounts, liabilities, or the USD/gold/silver rates — shifts
  every timing verdict with it.
- The existing single-payload read and optimistic-write behaviour, which the new
  screens are expected to reuse rather than duplicate.
