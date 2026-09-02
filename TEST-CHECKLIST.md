# Manual Test Checklist

This is the acceptance gate for Income Sheet Companion. There is no automated
test suite by design (see `specs/001-income-sheet-companion/plan.md`); this
checklist plus the quickstart scenarios are what "tested" means here.

Run **section 2 first** on any new deployment. It proves the sheet's formulas
are unreachable before you start trusting the write buttons.

Legend: ☐ = to do, ✅ = passed, ❌ = failed (write what happened).

---

## 1. Smoke

| ☐ | Check |
|---|---|
| ☐ | `/exec` opens on the phone and shows the Home screen |
| ☐ | Data visible within ~4 s on a cold load |
| ☐ | Reloading the tab renders figures within ~1 s (session cache) |
| ☐ | Apps Script → Executions shows exactly **one** `getState` per cold load |
| ☐ | "Data as of <time>" appears in the top bar |

---

## 2. Allowlist negative tests (do these first)

Paste the function below into a **new temporary file** in the Apps Script
editor (Files → + → Script → name it `zz_test`), run
`test_allowlistRejections`, read View → Logs, then **delete the file**.

Every attempt must be **DENIED**. A single ALLOWED line means the write guard
is broken — do not deploy.

```javascript
/**
 * TEMPORARY — allowlist negative tests. Delete this file after running.
 * Each case attempts a write that must be refused by guardedWrite().
 * Nothing here should ever modify the sheet.
 */
function test_allowlistRejections() {
  var cases = [
    // caller, sheet, a1, values, why it must be denied
    ['setAccountAmount', 'Dashboard',    'A3',      [[0]],                    'other sheet (Dashboard KPI)'],
    ['addTransaction',   'Transactions', 'G2',      [[0]],                    'computed EGP column G'],
    ['addTransaction',   'Transactions', 'A2:G2',   [[1, 2, 3, 4, 5, 6, 7]],  'range stretched over column G'],
    ['setAccountAmount', 'Data',         'D1',      [[0]],                    'header row'],
    ['setAccountAmount', 'Data',         'D9999',   [[0]],                    'past the last real account row'],
    ['setAccountAmount', 'Data',         'D2:D3',   [[0], [0]],               'multi-row target'],
    ['setInstallmentPaid', 'Installments', 'E1',    [['Yes']],                'header row'],
    ['setInstallmentPaid', 'Installments', 'D2',    [['Yes']],                'wrong column (amount)'],
    ['setLiabilityAmount', 'Total',      'J3',      [[0]],                    'header row above the liabilities block'],
    ['setLiabilityAmount', 'Total',      'I4',      [['x']],                  'liability name column'],
    ['setRate',          'Rates',        'B5',      [[1]],                    'below the three rate rows'],
    ['setRate',          'Rates',        'B1',      [[1]],                    'header row'],
    ['setPropertyPaid',  'Net Worth',    'B12',     [[0]],                    'outside the three property rows'],
    ['setPropertyPaid',  'Net Worth',    'A9',      [['x']],                  'label column'],
    ['takeSnapshot',     'History',      'A1:G1',   [[1, 2, 3, 4, 5, 6, 7]],  'header row'],
    ['takeSnapshot',     'History',      'A2:G2',   [[1, 2, 3, 4, 5, 6, 7]],  'live formula row'],
    ['notARealRpc',      'Data',         'D2',      [[0]],                    'unknown caller']
  ];

  var denied = 0, allowed = 0;
  cases.forEach(function (c) {
    try {
      guardedWrite(c[0], c[1], c[2], c[3]);
      allowed++;
      Logger.log('ALLOWED (BUG!) %s -> %s!%s — %s', c[0], c[1], c[2], c[4]);
    } catch (e) {
      denied++;
      Logger.log('denied  %s -> %s!%s — %s (%s)', c[0], c[1], c[2], c[4], e.message);
    }
  });
  Logger.log('--- %s denied, %s allowed (allowed MUST be 0) ---', denied, allowed);
}
```

Note: existing snapshot rows are deliberately **not** in the list. The
`takeSnapshot` entry only ever permits the row that `firstEmptySnapshotRow_()`
resolves to at that moment, so any occupied row is denied by construction —
and an "existing row" case would become a real write the day the History tab
is empty.

| ☐ | Check |
|---|---|
| ☐ | Every line in the log reads `denied` and the summary says `allowed MUST be 0` → `0 allowed` |
| ☐ | `Data!D1`, `Total!I4`, `Rates!B1` and `Installments!E1` are unchanged in the sheet |
| ☐ | `History` row 2 still contains its formulas (click a cell, look at the formula bar) |
| ☐ | `Transactions!G2` still contains its formula |
| ☐ | The temporary `zz_test` file is deleted afterwards |

---

## 3. Per-screen matrix — EN/LTR and AR/RTL

Walk each screen in English, then switch to العربية (Settings → Language) and
walk it again. Check both columns per row.

| Screen | EN/LTR | AR/RTL | What to verify |
|---|---|---|---|
| Home | ☐ | ☐ | 8 KPI cards, both charts render, countdown badge, overdue red only when > 0 |
| Add | ☐ | ☐ | Type toggle, 13 chips, account list, amount, currency, date, note, hint line |
| Installments | ☐ | ☐ | Summary card, 4 groups in order (overdue → due soon → upcoming → paid collapsed) |
| Accounts | ☐ | ☐ | Account list with badges, inline edit, add-account form |
| Rates | ☐ | ☐ | 3 rate inputs, "as of" dates read-only |
| Total & Investment | ☐ | ☐ | Per-class table scrolls sideways, liabilities editable, investment `$` figure |
| Net Worth | ☐ | ☐ | Statement lines, only the 3 property values editable |
| History | ☐ | ☐ | Snapshot table, line chart, Take snapshot button |
| Transactions | ☐ | ☐ | Monthly cards, list, 3 filters, empty state |
| Settings | ☐ | ☐ | Refresh, Open Google Sheet link, language toggle, about text |

In **Arabic**, additionally verify on every screen:

| ☐ | Check |
|---|---|
| ☐ | Bottom nav order mirrors (Home ends up on the right) |
| ☐ | Form labels, inputs and buttons mirror |
| ☐ | Table columns mirror; the table still scrolls sideways without the page scrolling |
| ☐ | List rows mirror (title on the right, amount on the left) |
| ☐ | Chart legends and tooltips are right-aligned |
| ☐ | Numbers stay Latin digits with `,` grouping — `1,234`, never `١٬٢٣٤` |
| ☐ | Dates stay `mm/dd/yyyy` |
| ☐ | Arabic names inside English text (e.g. "فرش") render intact, no reversed punctuation |
| ☐ | English account names inside Arabic UI render intact |
| ☐ | No untranslated English string anywhere (filters and chips included) |
| ☐ | Switching language does **not** trigger a new `getState` execution |
| ☐ | Close the tab, reopen `/exec` → still Arabic |

---

## 4. Editable = yellow audit (SC-010)

Walk all 10 screens in both languages:

| ☐ | Check |
|---|---|
| ☐ | Every control that writes to the sheet has the yellow `#FFF2CC` tint |
| ☐ | The inline edit input (Accounts / Liabilities / Net Worth) is yellow while open |
| ☐ | **No** read-only figure is yellow — Dashboard KPIs, totals, monthly summaries, snapshot rows, installment amounts, "as of" dates |
| ☐ | Liability *names* and net-worth *labels* are not editable |
| ☐ | Transaction filters are not yellow (they filter, they don't write) |

---

## 5. Write paths

Do each of these against the real sheet and check the cell afterwards.

| ☐ | Check |
|---|---|
| ☐ | **Add transaction**: lands in the first empty `Transactions` row, not row 501 |
| ☐ | Column A holds a real date (right-aligned, not a text string) |
| ☐ | Column E holds a real number (right-aligned) |
| ☐ | Column G computed itself — its formula is intact |
| ☐ | The monthly summary block updated |
| ☐ | Home → Add → chip → amount → submit is ≤ 3 taps plus digits |
| ☐ | **Mark installment paid**: exactly 2 taps (row → confirm) |
| ☐ | `Installments!E{row}` reads `Yes`; summary and dashboard figures moved |
| ☐ | An already-paid row offers no confirm dialog |
| ☐ | **Rate**: `Rates!B2` takes the new value and `C2` becomes today automatically |
| ☐ | Every EGP-converted figure matches the sheet after a refresh |
| ☐ | **Account amount**: `Data!D{row}` only — neighbouring cells untouched |
| ☐ | **Add account**: new row directly after the last real account, all 5 columns, checkbox in C works |
| ☐ | The new account appears in the Add screen's account list |
| ☐ | A duplicate account name is rejected with a clear message |
| ☐ | **Liability**: `Total!J{row}` only |
| ☐ | **Property**: `Net Worth!B9/B10/B11` only |
| ☐ | **Snapshot**: one new static row after the last snapshot (values, not formulas) |
| ☐ | Double-tapping Take snapshot creates no second row |

---

## 6. Optimistic rollback (airplane mode)

| ☐ | Check |
|---|---|
| ☐ | Turn on airplane mode, submit a transaction → it appears immediately in the recent list |
| ☐ | Within ~30 s it disappears again and an error toast shows |
| ☐ | Turn airplane mode off, refresh → the sheet never received the row |
| ☐ | The session cache does not retain the rolled-back entry |
| ☐ | Repeat for mark-installment-paid: the row flips back to unpaid |
| ☐ | After a write timeout the "data as of" indicator shows the ⚠ stale marker |

---

## 7. Status-colour parity (SC-006)

Same day, app and sheet side by side, Installments screen:

| ☐ | Check |
|---|---|
| ☐ | Every paid row is green in both |
| ☐ | Every overdue row is red in both |
| ☐ | Every row due within 3 months is amber in both |
| ☐ | Everything else is neutral in both |
| ☐ | Counts per group match the sheet's summary block |

---

## 8. Cache and dates

| ☐ | Check |
|---|---|
| ☐ | Open the app, leave it, come back next day without refreshing → countdown badge and installment colours follow **today's** date, not the cached day |
| ☐ | Manual refresh replaces the whole payload and updates "data as of" |
| ☐ | Clearing the browser session loses nothing — the sheet still has everything |

---

## 9. Sheet standalone (SC-011)

| ☐ | Check |
|---|---|
| ☐ | Close the app. Open the sheet directly |
| ☐ | Every tab looks and behaves as it did before the app existed |
| ☐ | The existing beautifier menu still appears and still works |
| ☐ | Editing yellow cells by hand still works |
| ☐ | Existing snapshot rows are untouched |

---

## 10. Touch targets and layout

| ☐ | Check |
|---|---|
| ☐ | Every button, chip, nav item and input is comfortably tappable (≥ 44px) |
| ☐ | No horizontal page scroll on a phone in either language |
| ☐ | Wide tables scroll inside their own container |
| ☐ | The bottom nav never covers the last row of a list |
| ☐ | Desktop is the same layout enlarged — nothing missing, nothing desktop-only |

---

## 11. Credit Card Payments & Monthly Cash-Flow Planning (spec 002)

Run `setupCreditCardPlanning()` once from the Apps Script editor before this
section (see `specs/002-credit-card-planning/quickstart.md`). Record the
SC-005 baseline (every installment/dashboard figure) **before** adding any
CC data.

### 11.1 Per-screen matrix — EN/LTR and AR/RTL

| Screen | EN/LTR | AR/RTL | What to verify |
|---|---|---|---|
| Cards | ☐ | ☐ | Card chips, add form, per-card grouped-by-month lists, still-to-pay total, "nothing due" state |
| Plan | ☐ | ☐ | Month nav (prev/next), income/verdict card, dated timeline, "+ Card payment" button |
| Forecast | ☐ | ☐ | 12-row table, shortage rows marked, projection label, row tap opens Plan |
| Home (plan card) | ☐ | ☐ | Month total, nearest unpaid line, shortage indicator, tap opens Plan |

### 11.2 Allowlist negative tests (five new callers)

Paste the function below into the same temporary `zz_test` file used in
section 2 (Files → + → Script → `zz_test` if you don't still have it), run
`test_ccAllowlistRejections`, read View → Logs, then **delete the file**
(or just the function, if you're keeping `zz_test` for future features).

Every attempt must be **DENIED**. A single ALLOWED line means the write
guard is broken — do not deploy.

```javascript
/**
 * TEMPORARY — CC Payments allowlist negative tests. Delete after running.
 * Each case attempts a write that must be refused by guardedWrite().
 * Nothing here should ever modify the sheet. Requires setupCreditCardPlanning()
 * to have already run once (CC Payments tab must exist).
 */
function test_ccAllowlistRejections() {
  var cases = [
    // caller, sheet, a1, values, why it must be denied
    ['addCcPayment',       'Data',        'A2:F2',  [['x', 'x', 'x', 'x', 'x', 'x']], 'wrong sheet'],
    ['addCcPayment',       'CC Payments', 'A1:F1',  [['x', 'x', 'x', 'x', 'x', 'x']], 'header row'],
    ['addCcPayment',       'CC Payments', 'A501:F501', [['x', 'x', 'x', 'x', 'x', 'x']], 'past row 500'],
    ['addCcPayment',       'CC Payments', 'A2:G2',  [['x', 'x', 'x', 'x', 'x', 'x', 'x']], 'stretched past column F'],
    ['addCcPayment',       'CC Payments', 'A2:F3',  [['x', 'x', 'x', 'x', 'x', 'x'], ['x', 'x', 'x', 'x', 'x', 'x']], 'multi-row target'],
    ['setCcPaymentStatus', 'CC Payments', 'A2',     [['Yes']],                'wrong column (card, not paid)'],
    ['setCcPaymentStatus', 'CC Payments', 'E1',     [['Yes']],                'header row'],
    ['setCcPaymentStatus', 'CC Payments', 'E501',   [['Yes']],                'past row 500'],
    ['setCcPaymentStatus', 'Installments','E2',     [['Yes']],                'wrong sheet (Installments E2 looks similar)'],
    ['updateCcPayment',    'CC Payments', 'H7:H7',  [['x']],                  'card-list column (should be A:F)'],
    ['updateCcPayment',    'CC Payments', 'A2:F2',  [['x', 'x', 'x', 'x', 'x']], 'shape mismatch — 5 values for a 6-column range'],
    ['deleteCcPayment',    'CC Payments', 'A1:F1',  [['', '', '', '', '', '']], 'header row'],
    ['deleteCcPayment',    'CC Payments', 'H2:H4',  [['', '', '']],           'settings block, not the payments body'],
    ['setSalary',          'CC Payments', 'I1',     [[2250]],                 'above the settings block'],
    ['setSalary',          'CC Payments', 'I5',     [[2250]],                 'below the settings block'],
    ['setSalary',          'CC Payments', 'H2',     [[2250]],                 'label column, not the value column'],
    ['setSalary',          'CC Payments', 'I2:I4',  [[2250], ['USD'], [27]],  'multi-row target (three single-cell writes only)'],
    ['notARealCcRpc',      'CC Payments', 'A2',     [['x']],                  'unknown caller']
  ];

  var denied = 0, allowed = 0;
  cases.forEach(function (c) {
    try {
      guardedWrite(c[0], c[1], c[2], c[3]);
      allowed++;
      Logger.log('ALLOWED (BUG!) %s -> %s!%s — %s', c[0], c[1], c[2], c[4]);
    } catch (e) {
      denied++;
      Logger.log('denied  %s -> %s!%s — %s (%s)', c[0], c[1], c[2], c[4], e.message);
    }
  });
  Logger.log('--- %s denied, %s allowed (allowed MUST be 0) ---', denied, allowed);
}
```

| ☐ | Check |
|---|---|
| ☐ | Every line in the log reads `denied` and the summary says `allowed MUST be 0` → `0 allowed` |
| ☐ | `CC Payments!A1:F1`, `H2:H6`, `H7:H26` are unchanged afterward |
| ☐ | `addCcPayment` on a full table (temporarily fill `A500`, then run it via the app or `addCcPayment({...})` from the editor) returns `LOG_FULL` — clear `A500` afterward |
| ☐ | The temporary `zz_test` file/function is deleted afterward |

### 11.3 Feature checks

| ☐ | Check |
|---|---|
| ☐ | Home → Plan → "+ Card payment" → Submit is ≤ 3 taps (FR-040) |
| ☐ | Status toggle is 1 tap each way and survives a refresh; transaction log and account balances unchanged (SC-010) |
| ☐ | Adding a duplicate (same card+amount+due date, or matching an installment's date+amount) shows a warning before saving |
| ☐ | Editing a cell by hand in `CC Payments` shows up in the app after refresh (FR-045) |
| ☐ | Changing the USD rate moves every converted income figure with zero extra RPCs (FR-033) |
| ☐ | Setting the rate to 0 shows "income unavailable", never a converted 0 (FR-017) |
| ☐ | The worked example (B0 400, ADIB 1,000/25th, installment 1,000 + salary $2,250@48.50/27th) reports first shortfall the 25th, amount to prepare 1,600, closing balance +107,525 |
| ☐ | A month whose obligations all fall after the salary date reports nothing to prepare |
| ☐ | Forecast carries a negative closing balance into the next row |
| ☐ | **SC-005 baseline comparison: every pre-existing installment/dashboard figure is unchanged after all the above** |

---
