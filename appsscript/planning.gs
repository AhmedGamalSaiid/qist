/**
 * Credit Card Payments & Monthly Cash-Flow Planning — server (Apps Script V8).
 * Adds one new sheet tab (`CC Payments`) and five new write RPCs to the
 * existing WRITE_ALLOWLIST/guardedWrite() funnel in api.gs. See
 * specs/002-credit-card-planning/contracts/ for the authoritative contracts.
 * setupCreditCardPlanning() is editor-run, one-time maintenance — never
 * called from any client code path.
 */

// ---------------------------------------------------------------------------
// One-time setup (T001) — contracts/sheet-layout.md
// ---------------------------------------------------------------------------

var CC_SEED_CARDS = ['ADIB CC', 'HSBC CC', 'CASHBACK CC', 'Valu CC'];

function setupCreditCardPlanning() {
  var ss = SpreadsheetApp.getActive();
  var s = ss.getSheetByName('CC Payments');
  var isNew = !s;
  if (isNew) s = ss.insertSheet('CC Payments');

  // Headers — never overwritten if already present, but header text is
  // idempotent to (re)write since it never holds user data.
  s.getRange('A1:F1').setValues([['Card', 'Due Date', 'Amount (EGP)', 'Statement Month', 'Paid', 'Note']]);
  s.getRange('H2').setValue('Salary Amount');
  s.getRange('H3').setValue('Salary Currency');
  s.getRange('H4').setValue('Salary Day');
  s.getRange('H6').setValue('Cards');

  // Seed settings only if blank — idempotent, never overwrites hand edits.
  if (String(s.getRange('I2').getValue()).trim() === '') s.getRange('I2').setValue(2250);
  if (String(s.getRange('I3').getValue()).trim() === '') s.getRange('I3').setValue('USD');
  if (String(s.getRange('I4').getValue()).trim() === '') s.getRange('I4').setValue(27);

  // Seed card list only into blank slots — never overwrites existing names.
  var cardCells = s.getRange('H7:H26').getValues();
  for (var i = 0; i < CC_SEED_CARDS.length; i++) {
    if (String(cardCells[i][0]).trim() === '') {
      s.getRange(7 + i, 8).setValue(CC_SEED_CARDS[i]);
    }
  }

  // Number formats — safe to reapply every run.
  s.getRange('B2:B500').setNumberFormat('mm/dd/yyyy').setHorizontalAlignment('center');
  s.getRange('C2:C500').setNumberFormat('#,##0').setHorizontalAlignment('right');
  s.getRange('D2:D500').setNumberFormat('@');

  // Data validations.
  s.getRange('E2:E500').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).setAllowInvalid(false).build());
  s.getRange('A2:A500').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(s.getRange('H7:H26')).setAllowInvalid(false).build());
  s.getRange('I3').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['USD', 'EGP'], true).setAllowInvalid(false).build());
  s.getRange('I4').setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(1, 31).setAllowInvalid(false).build());

  // Input styling — yellow + bold blue on every editable cell.
  var YELLOW = '#FFF2CC', BLUE_IN = '#0000FF';
  s.getRange('A2:F500').setBackground(YELLOW).setFontColor(BLUE_IN).setFontWeight('bold');
  s.getRange('I2:I4').setBackground(YELLOW).setFontColor(BLUE_IN).setFontWeight('bold');

  // Header styling to match the Installments grammar.
  var NAVY = '#1F3864', WHITE = '#FFFFFF';
  s.getRange('A1:F1').setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold').setHorizontalAlignment('center');
  s.getRange('H2:H4').setFontWeight('bold');
  s.getRange('H6').setFontWeight('bold');

  // Conditional formatting — same rules and colours as Installments.
  var GREEN_F = '#E2EFDA', GREEN_T = '#375623';
  var RED_F = '#FCE4E4', RED_T = '#9C0006';
  var AMBER_F = '#FFF3CD', AMBER_T = '#8A6D00';
  var rng = [s.getRange('A2:F500')];
  var rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$E2="Yes"')
    .setBackground(GREEN_F).setFontColor(GREEN_T)
    .setRanges(rng).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($E2="No",$B2<TODAY())')
    .setBackground(RED_F).setFontColor(RED_T).setBold(true)
    .setRanges(rng).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($E2="No",$B2>=TODAY(),$B2<=EDATE(TODAY(),3))')
    .setBackground(AMBER_F).setFontColor(AMBER_T).setBold(true)
    .setRanges(rng).build());
  s.setConditionalFormatRules(rules);

  s.setTabColor('#C00000');

  try {
    SpreadsheetApp.getUi().alert('CC Payments tab ' + (isNew ? 'created' : 'verified') + '.');
  } catch (e) {
    Logger.log('CC Payments tab ' + (isNew ? 'created' : 'verified') + '.');
  }
}

// ---------------------------------------------------------------------------
// Dynamic range resolvers (T004)
// ---------------------------------------------------------------------------

/** Last row (>= 2) with a non-blank CC Payments!A value, or 1 if none. */
function lastCcRow_() {
  var sh = ccSheet_();
  if (!sh) return 1;
  var values = sh.getRange('A2:A500').getValues();
  var last = 1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() !== '') last = i + 2;
  }
  return last;
}

/** First blank-A row in CC Payments!A2:A500, or -1 if full. */
function firstBlankCcRow_() {
  var sh = ccSheet_();
  if (!sh) return -1;
  var values = sh.getRange('A2:A500').getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === '') return i + 2;
  }
  return -1;
}

/** Returns the CC Payments sheet, or null if setupCreditCardPlanning() hasn't run. */
function ccSheet_() {
  return SpreadsheetApp.getActive().getSheetByName('CC Payments');
}

// ---------------------------------------------------------------------------
// Readers (T005) — contracts/rpc-contract.md, data-model.md
// ---------------------------------------------------------------------------

function readCreditCards_(ss) {
  var sh = ss.getSheetByName('CC Payments');
  if (!sh) return { setup: false, cards: [], payments: [] };

  var cardRaw = sh.getRange('H7:H26').getValues();
  var cards = [];
  for (var c = 0; c < cardRaw.length; c++) {
    var name = String(cardRaw[c][0]).trim();
    if (name) cards.push(name);
  }

  var last = lastCcRow_();
  var payments = [];
  if (last >= 2) {
    var rows = sh.getRange('A2:F' + last).getValues();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (String(r[0]).trim() === '') continue;
      var dueDate = toIso_(r[1]);
      var statementMonth = String(r[3]).trim();
      if (!statementMonth && dueDate) {
        var parts = dueDate.split('-');
        statementMonth = parts[1] + '/' + parts[0];
      }
      payments.push({
        row: i + 2,
        card: String(r[0]),
        dueDate: dueDate,
        amountEgp: toNumber_(r[2]),
        statementMonth: statementMonth,
        paid: String(r[4]).trim().toLowerCase() === 'yes',
        note: r[5] ? String(r[5]) : ''
      });
    }
  }

  return { setup: true, cards: cards, payments: payments };
}

function readIncome_(ss) {
  var sh = ss.getSheetByName('CC Payments');
  if (!sh) return { salary: null };
  var vals = sh.getRange('I2:I4').getValues();
  var amount = toNumber_(vals[0][0]);
  var currency = String(vals[1][0]).trim();
  var day = Number(vals[2][0]);
  if (!amount || !currency || !isFinite(day)) return { salary: null };
  return { salary: { amount: amount, currency: currency, day: day } };
}

// ---------------------------------------------------------------------------
// Write RPCs (T011-T013, T025) — contracts/rpc-contract.md
// ---------------------------------------------------------------------------

var CC_CURRENCIES = { USD: 1, EGP: 1 };

/** Validates the shared addCcPayment/updateCcPayment payload shape. */
function validateCcPayment_(payment, knownCards) {
  if (!payment) throw appError_(ERR.VALIDATION, 'Payment payload missing.');
  var card = String(payment.card || '');
  if (knownCards.indexOf(card) === -1) throw appError_(ERR.VALIDATION, 'card');
  var amount = Number(payment.amount);
  if (!isFinite(amount) || amount <= 0) throw appError_(ERR.VALIDATION, 'amount');
  var dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(payment.dueDate || ''));
  if (!dateParts) throw appError_(ERR.VALIDATION, 'dueDate');
  var note = payment.note ? String(payment.note) : '';
  if (note.length > 500) throw appError_(ERR.VALIDATION, 'note');
  var dueDateValue = new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]));
  var statementMonth = String(payment.statementMonth || '').trim();
  if (!statementMonth) {
    statementMonth = (Number(dateParts[2])) + '/' + dateParts[1]; // due-date month (FR-006)
  }
  return { card: card, amount: amount, dueDateValue: dueDateValue, statementMonth: statementMonth, note: note };
}

/** T011 — records one payment; appends under lock at the first blank row. */
function addCcPayment(payment) {
  var ss = SpreadsheetApp.getActive();
  var creditCards = readCreditCards_(ss);
  if (!creditCards.setup) throw appError_(ERR.MARKER_MISSING, 'CC Payments tab not set up.');
  var v = validateCcPayment_(payment, creditCards.cards);

  withLock_(function () {
    var row = firstBlankCcRow_();
    if (row === -1) throw appError_(ERR.LOG_FULL, 'No blank row available in CC Payments.');
    guardedWrite('addCcPayment', 'CC Payments', 'A' + row + ':F' + row,
      [[v.card, v.dueDateValue, v.amount, v.statementMonth, 'No', v.note]]);
  });

  return { creditCards: readCreditCards_(SpreadsheetApp.getActive()) };
}

/** T012 — two-way Paid toggle (BR-002); no ALREADY_PAID check either direction. */
function setCcPaymentStatus(row, paid) {
  row = Number(row);
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('CC Payments');
  if (!sh) throw appError_(ERR.MARKER_MISSING, 'CC Payments tab not set up.');
  if (!isFinite(row) || row < 2 || row > 500) throw appError_(ERR.VALIDATION, 'row');
  var current = String(sh.getRange('A' + row).getValue()).trim();
  if (!current) throw appError_(ERR.VALIDATION, 'row does not hold a payment');
  guardedWrite('setCcPaymentStatus', 'CC Payments', 'E' + row, [[paid ? 'Yes' : 'No']]);
  return { creditCards: readCreditCards_(SpreadsheetApp.getActive()) };
}

/** T013 — corrects a payment's fields; preserves the caller-supplied paid flag. */
function updateCcPayment(row, payment) {
  row = Number(row);
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('CC Payments');
  if (!sh) throw appError_(ERR.MARKER_MISSING, 'CC Payments tab not set up.');
  if (!isFinite(row) || row < 2 || row > 500) throw appError_(ERR.VALIDATION, 'row');
  var current = String(sh.getRange('A' + row).getValue()).trim();
  if (!current) throw appError_(ERR.VALIDATION, 'row does not hold a payment');

  var creditCards = readCreditCards_(ss);
  var v = validateCcPayment_(payment, creditCards.cards);
  var paid = !!payment.paid;

  guardedWrite('updateCcPayment', 'CC Payments', 'A' + row + ':F' + row,
    [[v.card, v.dueDateValue, v.amount, v.statementMonth, paid ? 'Yes' : 'No', v.note]]);

  return { creditCards: readCreditCards_(SpreadsheetApp.getActive()) };
}

/** T013 — removes a payment by blanking A:F; the slot is reused by the next append. */
function deleteCcPayment(row) {
  row = Number(row);
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('CC Payments');
  if (!sh) throw appError_(ERR.MARKER_MISSING, 'CC Payments tab not set up.');
  if (!isFinite(row) || row < 2 || row > 500) throw appError_(ERR.VALIDATION, 'row');
  var current = String(sh.getRange('A' + row).getValue()).trim();
  if (!current) throw appError_(ERR.VALIDATION, 'row does not hold a payment');

  guardedWrite('deleteCcPayment', 'CC Payments', 'A' + row + ':F' + row, [['', '', '', '', '', '']]);

  return { creditCards: readCreditCards_(SpreadsheetApp.getActive()) };
}

/** T025 — edits the recurring salary settings. */
function setSalary(salary) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('CC Payments');
  if (!sh) throw appError_(ERR.MARKER_MISSING, 'CC Payments tab not set up.');
  if (!salary) throw appError_(ERR.VALIDATION, 'Salary payload missing.');
  var amount = Number(salary.amount);
  if (!isFinite(amount) || amount <= 0) throw appError_(ERR.VALIDATION, 'amount');
  if (!CC_CURRENCIES[salary.currency]) throw appError_(ERR.VALIDATION, 'currency');
  var day = Number(salary.day);
  if (!isFinite(day) || day < 1 || day > 31) throw appError_(ERR.VALIDATION, 'day');

  guardedWrite('setSalary', 'CC Payments', 'I2', [[amount]]);
  guardedWrite('setSalary', 'CC Payments', 'I3', [[salary.currency]]);
  guardedWrite('setSalary', 'CC Payments', 'I4', [[day]]);

  return { income: readIncome_(SpreadsheetApp.getActive()) };
}
