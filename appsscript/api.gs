/**
 * Income Sheet Companion — server (Apps Script V8).
 * Bound to the owner's personal-finance sheet. Reads are unrestricted;
 * every write funnels through guardedWrite() against WRITE_ALLOWLIST.
 * See specs/001-income-sheet-companion/contracts/ for the authoritative
 * RPC and allowlist contracts.
 */

// ---------------------------------------------------------------------------
// Error codes (contracts/rpc-contract.md "Error contract")
// ---------------------------------------------------------------------------

var ERR = {
  VALIDATION: 'VALIDATION',
  RANGE_DENIED: 'RANGE_DENIED',
  LOG_FULL: 'LOG_FULL',
  LOCK_TIMEOUT: 'LOCK_TIMEOUT',
  ALREADY_PAID: 'ALREADY_PAID',
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  MARKER_MISSING: 'MARKER_MISSING'
};

function appError_(code, message) {
  var e = new Error((message ? message + ' ' : '') + '[' + code + ']');
  e.code = code;
  return e;
}

// ---------------------------------------------------------------------------
// doGet / include — HtmlService shell (T005)
// ---------------------------------------------------------------------------

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('Income Sheet Companion')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------------------------------------------------------------------
// WRITE_ALLOWLIST + guardedWrite (T006) — contracts/write-allowlist.md
// ---------------------------------------------------------------------------

/**
 * Parses a single-row A1 reference ("D7" or "A7:E7") into
 * `{ c1, c2, row }`. Returns null for anything else — multi-row ranges,
 * whole-column references, sheet-qualified names — so guardedWrite denies
 * every shape the allowlist does not describe.
 */
function parseA1_(a1) {
  var m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(String(a1));
  if (!m) return null;
  var row = Number(m[2]);
  if (m[4] && Number(m[4]) !== row) return null; // multi-row: never allowed
  return { c1: m[1], c2: m[3] || m[1], row: row };
}

/**
 * Frozen, keyed by RPC name. Each entry's `sheet` names the only sheet that
 * RPC may write to; `allows(p)` decides whether a parsed single-row A1
 * target is inside that RPC's allowed columns AND rows. Row bounds are
 * re-resolved here from live sheet content at guard time — never taken from
 * the caller — so headers, computed columns, live rows and existing
 * snapshots are unreachable by construction (contracts/write-allowlist.md
 * invariants 1–3). guardedWrite() is the only function in this file that
 * calls setValue/setValues.
 */
var WRITE_ALLOWLIST = Object.freeze({
  setAccountAmount: Object.freeze({
    sheet: 'Data',
    allows: function (p) {
      return p.c1 === 'D' && p.c2 === 'D' && p.row >= 2 && p.row <= lastAccountRow_();
    }
  }),
  addAccount: Object.freeze({
    sheet: 'Data',
    allows: function (p) {
      return p.c1 === 'A' && p.c2 === 'E' && p.row === lastAccountRow_() + 1;
    }
  }),
  setLiabilityAmount: Object.freeze({
    sheet: 'Total',
    allows: function (p) {
      return p.c1 === 'J' && p.c2 === 'J' && p.row >= 4 && p.row <= 10;
    }
  }),
  setInstallmentPaid: Object.freeze({
    sheet: 'Installments',
    allows: function (p) {
      return p.c1 === 'E' && p.c2 === 'E' && p.row >= 2 && p.row <= lastInstallmentRow_();
    }
  }),
  setRate: Object.freeze({
    sheet: 'Rates',
    allows: function (p) {
      return (p.c1 === 'B' || p.c1 === 'C') && p.c2 === p.c1 && p.row >= 2 && p.row <= 4;
    }
  }),
  setPropertyPaid: Object.freeze({
    sheet: 'Net Worth',
    allows: function (p) {
      return p.c1 === 'B' && p.c2 === 'B' && p.row >= 9 && p.row <= 11;
    }
  }),
  addTransaction: Object.freeze({
    sheet: 'Transactions',
    // Row bound is the pre-formatted log extent [2, 500]; the exact first
    // blank row is resolved under lock by the RPC. It cannot be re-resolved
    // here because the A:F write fills column A before the paired H write.
    allows: function (p) {
      if (p.row < 2 || p.row > 500) return false;
      return (p.c1 === 'A' && p.c2 === 'F') || (p.c1 === 'H' && p.c2 === 'H');
    }
  }),
  takeSnapshot: Object.freeze({
    sheet: 'History',
    allows: function (p) {
      return p.c1 === 'A' && p.c2 === 'G' && p.row === firstEmptySnapshotRow_();
    }
  }),
  addCcPayment: Object.freeze({
    sheet: 'CC Payments',
    // Row bound mirrors addTransaction: the exact first blank row is
    // resolved under lock by the RPC, which fills column A.
    allows: function (p) {
      return p.c1 === 'A' && p.c2 === 'F' && p.row >= 2 && p.row <= 500;
    }
  }),
  setCcPaymentStatus: Object.freeze({
    sheet: 'CC Payments',
    allows: function (p) {
      return p.c1 === 'E' && p.c2 === 'E' && p.row >= 2 && p.row <= 500;
    }
  }),
  updateCcPayment: Object.freeze({
    sheet: 'CC Payments',
    allows: function (p) {
      return p.c1 === 'A' && p.c2 === 'F' && p.row >= 2 && p.row <= 500;
    }
  }),
  deleteCcPayment: Object.freeze({
    sheet: 'CC Payments',
    allows: function (p) {
      return p.c1 === 'A' && p.c2 === 'F' && p.row >= 2 && p.row <= 500;
    }
  }),
  setSalary: Object.freeze({
    sheet: 'CC Payments',
    allows: function (p) {
      return p.c1 === 'I' && p.c2 === 'I' && p.row >= 2 && p.row <= 4;
    }
  })
});

/**
 * The only function permitted to mutate a cell. `caller` is the RPC name
 * (must be a WRITE_ALLOWLIST key); `sheetName` and `a1` must match that
 * entry's sheet, columns and freshly resolved row bounds; `values` is a 2D
 * array matching the resolved a1 shape.
 */
function guardedWrite(caller, sheetName, a1, values) {
  var entry = WRITE_ALLOWLIST[caller];
  if (!entry) throw appError_(ERR.RANGE_DENIED, 'Unknown write caller "' + caller + '".');
  var parsed = parseA1_(a1);
  if (sheetName !== entry.sheet || !parsed || !entry.allows(parsed)) {
    throw appError_(ERR.RANGE_DENIED, caller + ' may not write ' + sheetName + '!' + a1 + '.');
  }
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw appError_(ERR.MARKER_MISSING, 'Sheet "' + sheetName + '" not found.');
  var range = sheet.getRange(a1);
  if (range.getNumRows() !== values.length || range.getNumColumns() !== values[0].length) {
    throw appError_(ERR.RANGE_DENIED, 'Payload shape does not match resolved range ' + a1 + '.');
  }
  range.setValues(values);
}

// ---------------------------------------------------------------------------
// Dynamic range resolvers (T007)
// ---------------------------------------------------------------------------

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw appError_(ERR.MARKER_MISSING, 'Expected sheet "' + name + '" was not found.');
  return sh;
}

/** Last row (>= 2) with a non-empty Data!A value. */
function lastAccountRow_() {
  var sh = sheet_('Data');
  var values = sh.getRange('A2:A' + Math.max(sh.getLastRow(), 2)).getValues();
  var last = 1; // header row
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() !== '') last = i + 2;
  }
  if (last < 2) throw appError_(ERR.MARKER_MISSING, 'Data tab has no account rows.');
  return last;
}

/** Last row (>= 2) with a non-empty Installments!A value. */
function lastInstallmentRow_() {
  var sh = sheet_('Installments');
  var values = sh.getRange('A2:A' + Math.max(sh.getLastRow(), 2)).getValues();
  var last = 1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() !== '') last = i + 2;
  }
  if (last < 2) throw appError_(ERR.MARKER_MISSING, 'Installments tab has no schedule rows.');
  return last;
}

/** First row in Transactions!A2:A500 with a blank A cell, or -1 if full. */
function firstBlankTransactionRow_() {
  var sh = sheet_('Transactions');
  var values = sh.getRange('A2:A500').getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === '') return i + 2;
  }
  return -1;
}

/** First empty row after the "SNAPSHOTS ↓" marker in History!A. */
function firstEmptySnapshotRow_() {
  var sh = sheet_('History');
  var colA = sh.getRange('A1:A' + Math.max(sh.getLastRow(), 3)).getValues();
  var markerRow = -1;
  for (var i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).indexOf('SNAPSHOTS') !== -1) { markerRow = i + 1; break; }
  }
  if (markerRow === -1) throw appError_(ERR.MARKER_MISSING, 'History "SNAPSHOTS ↓" marker not found.');
  for (var r = markerRow + 1; r <= colA.length; r++) {
    if (String(colA[r - 1][0]).trim() === '') return r;
  }
  return colA.length + 1;
}

// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------

function toIso_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

function toNumber_(value) {
  if (value === '' || value === null || value === undefined) return 0;
  var n = Number(value);
  return isNaN(n) ? 0 : n;
}

function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// getState() (T008) — see contracts/rpc-contract.md, data-model.md
// ---------------------------------------------------------------------------

function getState() {
  var ss = SpreadsheetApp.getActive();
  var state = {
    dashboard: readDashboard_(ss),
    data: readAccounts_(ss),
    total: readTotals_(ss),
    installments: readInstallments_(ss),
    investment: readInvestment_(ss),
    rates: readRates_(ss),
    netWorth: readNetWorth_(ss),
    transactions: readTransactions_(ss),
    history: readHistory_(ss),
    creditCards: readCreditCards_(ss),
    income: readIncome_(ss),
    meta: {
      fetchedAt: new Date().toISOString(),
      sheetUrl: ss.getUrl()
    }
  };
  return state;
}

function readDashboard_(ss) {
  var sh = sheet_('Dashboard');
  var kpi = sh.getRange('A3:C12').getValues();
  var byLabel = {};
  for (var i = 0; i < kpi.length; i++) {
    var label = String(kpi[i][0]).trim();
    if (label) byLabel[label] = kpi[i];
  }
  function findRow(pred) {
    for (var l in byLabel) if (pred(l)) return byLabel[l];
    return null;
  }
  var nextRow = findRow(function (l) { return /next installment/i.test(l); });

  var assetMixRaw = sh.getRange('E1:F6').getValues();
  var assetMix = [];
  for (var a = 1; a < assetMixRaw.length; a++) {
    var label2 = String(assetMixRaw[a][0]).trim();
    if (label2) assetMix.push({ label: label2, egp: toNumber_(assetMixRaw[a][1]) });
  }

  var unpaidRaw = sh.getRange('H1:I22').getValues();
  var unpaidByYear = [];
  for (var u = 1; u < unpaidRaw.length; u++) {
    var yr = unpaidRaw[u][0];
    if (yr === '' || yr === null) continue;
    unpaidByYear.push({ year: Number(yr), amount: toNumber_(unpaidRaw[u][1]) });
  }

  return {
    netWorthCurrent: num_(byLabel, /net worth/i),
    totalAssets: num_(byLabel, /total assets/i),
    liquid: num_(byLabel, /liquid/i),
    investments: num_(byLabel, /investment/i),
    shortTermLiabilities: num_(byLabel, /short.?term liabilit/i),
    remainingInstallments: num_(byLabel, /remaining installment/i),
    nextInstallment: nextRow ? { date: toIso_(nextRow[1]), amount: toNumber_(nextRow[2]) } : { date: null, amount: 0 },
    dueNext12Months: num_(byLabel, /due next 12/i),
    overdueCount: num_(byLabel, /overdue/i),
    // Dashboard!A12 reads "USD / EGP rate" with spaces around the slash, so the
    // separator has to tolerate whitespace or this silently reports 0.
    usdRate: num_(byLabel, /usd\s*\/?\s*egp|usd\s+rate/i),
    assetMix: assetMix,
    unpaidByYear: unpaidByYear
  };
}

function num_(byLabel, re) {
  for (var l in byLabel) {
    if (re.test(l)) return toNumber_(byLabel[l][1]);
  }
  return 0;
}

function readAccounts_(ss) {
  var sh = sheet_('Data');
  var last = lastAccountRow_();
  var rows = sh.getRange('A2:E' + last).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[0]).trim() === '') continue;
    out.push({
      row: i + 2,
      name: String(r[0]),
      category: String(r[1]),
      investment: r[2] === true || String(r[2]).toUpperCase() === 'TRUE',
      amount: toNumber_(r[3]),
      date: toIso_(r[4])
    });
  }
  return out;
}

function readTotalsBlock_(sh, rangeA1) {
  var raw = sh.getRange(rangeA1).getValues();
  var header = raw[0];
  var row = raw[1] || [];
  return { header: header, row: row };
}

function readTotals_(ss) {
  var sh = sheet_('Total');
  var block = readTotalsBlock_(sh, 'A1:L2');
  var header = block.header, row = block.row;
  var perClass = [];
  // Columns A..? alternate class name headers with native/EGP pairs; the
  // final few columns are the aggregate figures (Total EGP, Credit, Total
  // of All) and the dollar/gold/silver rates. We read generically: any
  // header containing "Rate" -> rate figure; "Total EGP"/"Credit"/"Total of
  // All" -> aggregates; everything else in pairs -> per-class native/EGP.
  var dollarRate = 0, goldRate = 0, silverRate = 0, totalEgp = 0, credit = 0, totalOfAll = 0;
  var classCols = [];
  for (var c = 0; c < header.length; c++) {
    var h = String(header[c]).trim();
    if (!h) continue;
    if (/dollar/i.test(h)) dollarRate = toNumber_(row[c]);
    else if (/gold/i.test(h)) goldRate = toNumber_(row[c]);
    else if (/silver/i.test(h)) silverRate = toNumber_(row[c]);
    else if (/total egp/i.test(h)) totalEgp = toNumber_(row[c]);
    else if (/credit/i.test(h)) credit = toNumber_(row[c]);
    else if (/total of all/i.test(h)) totalOfAll = toNumber_(row[c]);
    else classCols.push({ col: c, label: h });
  }
  // Pair up remaining class columns as native/EGP by adjacency.
  for (var p = 0; p < classCols.length; p += 2) {
    if (!classCols[p + 1]) break;
    perClass.push({
      class: classCols[p].label.replace(/\s*(native|egp)\s*/i, ''),
      native: toNumber_(row[classCols[p].col]),
      egp: toNumber_(row[classCols[p + 1].col])
    });
  }

  var liabRaw = sh.getRange('I3:J10').getValues();
  var liabilities = [];
  for (var i = 1; i < liabRaw.length; i++) { // skip header at I3
    var name = String(liabRaw[i][0]).trim();
    if (!name) continue;
    liabilities.push({ row: i + 3, name: name, amount: toNumber_(liabRaw[i][1]) });
  }

  return {
    dollarRate: dollarRate,
    goldRate: goldRate,
    silverRate: silverRate,
    perClass: perClass,
    totalEgp: totalEgp,
    credit: credit,
    totalOfAll: totalOfAll,
    liabilities: liabilities
  };
}

function readInstallments_(ss) {
  var sh = sheet_('Installments');
  var last = lastInstallmentRow_();
  var rows = sh.getRange('A2:E' + last).getValues();
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[0]).trim() === '') continue;
    list.push({
      row: i + 2,
      name: String(r[0]),
      dueDate: toIso_(r[1]),
      amountEgp: toNumber_(r[2]),
      type: String(r[3]),
      paid: String(r[4]).trim().toLowerCase() === 'yes'
    });
  }

  var summaryRaw = sh.getRange('G1:H10').getValues();
  var byLabel = {};
  for (var s = 0; s < summaryRaw.length; s++) {
    var label = String(summaryRaw[s][0]).trim();
    if (label) byLabel[label] = summaryRaw[s][1];
  }
  function sNum(re) {
    for (var l in byLabel) if (re.test(l)) return toNumber_(byLabel[l]);
    return 0;
  }
  function sVal(re) {
    for (var l in byLabel) if (re.test(l)) return byLabel[l];
    return null;
  }

  var summary = {
    totalScheduled: sNum(/total scheduled/i),
    totalPaid: sNum(/total paid/i),
    totalRemaining: sNum(/total remaining/i),
    nextDueDate: toIso_(sVal(/next due date/i)),
    nextAmountDue: sNum(/next amount/i),
    due3m: sNum(/3 month/i),
    due6m: sNum(/6 month/i),
    due12m: sNum(/12 month/i),
    overdueCount: sNum(/overdue/i)
  };

  return { rows: list, summary: summary };
}

function readInvestment_(ss) {
  var sh = sheet_('Investment');
  var block = readTotalsBlock_(sh, 'A1:K2');
  var header = block.header, row = block.row;
  var out = { columns: [] };
  for (var c = 0; c < header.length; c++) {
    var h = String(header[c]).trim();
    if (!h) continue;
    out.columns.push({ label: h, value: toNumber_(row[c]), isUsd: /usd|\$/i.test(h) });
  }
  return out;
}

function readRates_(ss) {
  var sh = sheet_('Rates');
  var vals = sh.getRange('B2:C4').getValues();
  return {
    usd: { value: toNumber_(vals[0][0]), asOf: toIso_(vals[0][1]) },
    gold: { value: toNumber_(vals[1][0]), asOf: toIso_(vals[1][1]) },
    silver: { value: toNumber_(vals[2][0]), asOf: toIso_(vals[2][1]) }
  };
}

function readNetWorth_(ss) {
  var sh = sheet_('Net Worth');
  var raw = sh.getRange('A1:B20').getValues();
  var editableRows = { 9: true, 10: true, 11: true };
  var lines = [];
  var section = 'assets';
  for (var i = 0; i < raw.length; i++) {
    var label = String(raw[i][0]).trim();
    if (!label) continue;
    var rowNum = i + 1;
    if (/^liabilit/i.test(label)) section = 'liabilities';
    if (/^net worth/i.test(label)) section = 'result';
    lines.push({
      row: rowNum,
      label: label,
      value: toNumber_(raw[i][1]),
      section: section,
      editable: !!editableRows[rowNum]
    });
  }
  return { lines: lines };
}

function readTransactions_(ss) {
  var sh = sheet_('Transactions');
  var lastRow = Math.min(sh.getLastRow(), 500);
  var rows = [];
  if (lastRow >= 2) {
    var raw = sh.getRange('A2:H' + lastRow).getValues();
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (String(r[0]).trim() === '' && !(r[0] instanceof Date)) continue;
      rows.push({
        row: i + 2,
        date: toIso_(r[0]),
        type: String(r[1]),
        category: String(r[2]),
        account: String(r[3]),
        amount: toNumber_(r[4]),
        currency: String(r[5]),
        amountEgp: toNumber_(r[6]),
        note: r[7] ? String(r[7]) : ''
      });
    }
  }
  rows.sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || a.row - b.row; });
  var recent = rows.slice(-50).reverse();

  var monthlyRaw = sh.getRange('J1:N200').getValues();
  var monthly = [];
  for (var m = 1; m < monthlyRaw.length; m++) {
    var mr = monthlyRaw[m];
    var month = String(mr[0]).trim();
    if (!month) continue;
    monthly.push({
      month: month,
      income: toNumber_(mr[1]),
      expenses: toNumber_(mr[2]),
      netSaved: toNumber_(mr[3]),
      savingsRate: toNumber_(mr[4])
    });
  }

  return { recent: recent, monthly: monthly };
}

function readHistory_(ss) {
  var sh = sheet_('History');
  var lastRow = sh.getLastRow();
  if (lastRow < 4) return [];
  var raw = sh.getRange('A4:G' + lastRow).getValues();
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var r = raw[i];
    if (String(r[0]).trim() === '' && !(r[0] instanceof Date)) continue;
    out.push({
      date: toIso_(r[0]),
      liquid: toNumber_(r[1]),
      investments: toNumber_(r[2]),
      propertyPaid: toNumber_(r[3]),
      shortTermLiab: toNumber_(r[4]),
      remainingInstallments: toNumber_(r[5]),
      netWorth: toNumber_(r[6])
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Write RPCs (T018, T021, T024, T026, T027, T034)
// ---------------------------------------------------------------------------

var TX_TYPES = { Income: 1, Expense: 1, Transfer: 1 };
var TX_CATEGORIES = {
  Salary: 1, Freelance: 1, Food: 1, Transport: 1, Rent: 1, Utilities: 1,
  Shopping: 1, Health: 1, Education: 1, Entertainment: 1, Installment: 1,
  Investment: 1, Other: 1
};
var TX_CURRENCIES = { EGP: 1, USD: 1 };
var ACCOUNT_CATEGORIES = { USD: 1, EGP: 1, Gold: 1, Silver: 1, Liability: 1 };
var RATE_KEYS = { usd: 2, gold: 3, silver: 4 };
var PROPERTY_ROWS = { 9: 1, 10: 1, 11: 1 };

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(30000);
  if (!acquired) throw appError_(ERR.LOCK_TIMEOUT, 'Could not acquire the sheet lock.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** T018 — appends a transaction under lock; returns {recent, monthly, dashboard}. */
function addTransaction(tx) {
  if (!tx) throw appError_(ERR.VALIDATION, 'Transaction payload missing.');
  if (!TX_TYPES[tx.type]) throw appError_(ERR.VALIDATION, 'type');
  if (!TX_CATEGORIES[tx.category]) throw appError_(ERR.VALIDATION, 'category');
  if (!TX_CURRENCIES[tx.currency]) throw appError_(ERR.VALIDATION, 'currency');
  var amount = Number(tx.amount);
  if (!isFinite(amount) || amount <= 0) throw appError_(ERR.VALIDATION, 'amount');
  var note = tx.note ? String(tx.note) : '';
  if (note.length > 500) throw appError_(ERR.VALIDATION, 'note');
  var dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tx.date || ''));
  if (!dateParts) throw appError_(ERR.VALIDATION, 'date');
  var dateValue = new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]));

  var accountName = String(tx.account || '');
  var accountExists = readAccounts_(SpreadsheetApp.getActive()).some(function (a) { return a.name === accountName; });
  if (!accountExists) throw appError_(ERR.VALIDATION, 'account');

  withLock_(function () {
    var row = firstBlankTransactionRow_();
    if (row === -1) throw appError_(ERR.LOG_FULL, 'No blank row available in Transactions.');
    guardedWrite('addTransaction', 'Transactions', 'A' + row + ':F' + row,
      [[dateValue, tx.type, tx.category, accountName, amount, tx.currency]]);
    guardedWrite('addTransaction', 'Transactions', 'H' + row, [[note]]);
  });

  var ss = SpreadsheetApp.getActive();
  var transactions = readTransactions_(ss);
  return { recent: transactions.recent, monthly: transactions.monthly, dashboard: readDashboard_(ss) };
}

/** T021 — flips one installment to Paid; returns {installments, dashboard}. */
function setInstallmentPaid(row) {
  row = Number(row);
  var last = lastInstallmentRow_();
  if (!isFinite(row) || row < 2 || row > last) throw appError_(ERR.VALIDATION, 'row');
  var sh = sheet_('Installments');
  var current = String(sh.getRange('E' + row).getValue()).trim().toLowerCase();
  if (current === 'yes') throw appError_(ERR.ALREADY_PAID, 'Installment already paid.');
  guardedWrite('setInstallmentPaid', 'Installments', 'E' + row, [['Yes']]);
  var ss = SpreadsheetApp.getActive();
  return { installments: readInstallments_(ss), dashboard: readDashboard_(ss) };
}

/** T024 — writes a rate and auto-dates it; returns the five recomputed slices. */
function setRate(key, value) {
  var r = RATE_KEYS[key];
  if (!r) throw appError_(ERR.VALIDATION, 'key');
  var v = Number(value);
  if (!isFinite(v) || v <= 0) throw appError_(ERR.VALIDATION, 'value');
  guardedWrite('setRate', 'Rates', 'B' + r, [[v]]);
  guardedWrite('setRate', 'Rates', 'C' + r, [[new Date()]]);
  var ss = SpreadsheetApp.getActive();
  return {
    rates: readRates_(ss),
    dashboard: readDashboard_(ss),
    total: readTotals_(ss),
    investment: readInvestment_(ss),
    netWorth: readNetWorth_(ss)
  };
}

/** T026 — edits one account's amount; returns the five recomputed slices. */
function setAccountAmount(row, value) {
  row = Number(row);
  var last = lastAccountRow_();
  if (!isFinite(row) || row < 2 || row > last) throw appError_(ERR.VALIDATION, 'row');
  var v = Number(value);
  if (!isFinite(v)) throw appError_(ERR.VALIDATION, 'value');
  guardedWrite('setAccountAmount', 'Data', 'D' + row, [[v]]);
  var ss = SpreadsheetApp.getActive();
  return {
    data: readAccounts_(ss),
    total: readTotals_(ss),
    investment: readInvestment_(ss),
    dashboard: readDashboard_(ss),
    netWorth: readNetWorth_(ss)
  };
}

/** T026 — appends a whole new account row under lock; same return shape. */
function addAccount(acc) {
  if (!acc) throw appError_(ERR.VALIDATION, 'Account payload missing.');
  var name = String(acc.name || '').trim();
  if (!name) throw appError_(ERR.VALIDATION, 'name');
  if (!ACCOUNT_CATEGORIES[acc.category]) throw appError_(ERR.VALIDATION, 'category');
  var amount = Number(acc.amount);
  if (!isFinite(amount)) throw appError_(ERR.VALIDATION, 'amount');
  var investment = !!acc.investment;
  var dateParts = acc.date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(acc.date)) : null;
  var dateValue = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date();

  var existing = readAccounts_(SpreadsheetApp.getActive());
  if (existing.some(function (a) { return a.name === name; })) {
    throw appError_(ERR.DUPLICATE_NAME, name);
  }

  withLock_(function () {
    var r = lastAccountRow_() + 1;
    guardedWrite('addAccount', 'Data', 'A' + r + ':E' + r,
      [[name, acc.category, investment, amount, dateValue]]);
  });

  var ss = SpreadsheetApp.getActive();
  return {
    data: readAccounts_(ss),
    total: readTotals_(ss),
    investment: readInvestment_(ss),
    dashboard: readDashboard_(ss),
    netWorth: readNetWorth_(ss)
  };
}

/** T027 — edits one short-term liability amount; returns {total, dashboard, netWorth}. */
function setLiabilityAmount(row, value) {
  row = Number(row);
  if (!isFinite(row) || row < 4 || row > 10) throw appError_(ERR.VALIDATION, 'row');
  var v = Number(value);
  if (!isFinite(v) || v < 0) throw appError_(ERR.VALIDATION, 'value');
  guardedWrite('setLiabilityAmount', 'Total', 'J' + row, [[v]]);
  var ss = SpreadsheetApp.getActive();
  return { total: readTotals_(ss), dashboard: readDashboard_(ss), netWorth: readNetWorth_(ss) };
}

/** T027 — edits one property paid-to-date value; returns {netWorth, dashboard}. */
function setPropertyPaid(row, value) {
  row = Number(row);
  if (!PROPERTY_ROWS[row]) throw appError_(ERR.VALIDATION, 'row');
  var v = Number(value);
  if (!isFinite(v) || v < 0) throw appError_(ERR.VALIDATION, 'value');
  guardedWrite('setPropertyPaid', 'Net Worth', 'B' + row, [[v]]);
  var ss = SpreadsheetApp.getActive();
  return { netWorth: readNetWorth_(ss), dashboard: readDashboard_(ss) };
}

/**
 * T034 — copies the History live row's current values as static values into
 * the first empty row after the "SNAPSHOTS ↓" marker.
 *
 * Deliberately does NOT delegate to Code.gs's addSnapshot(). That global writes
 * with appendRow(), which bypasses guardedWrite()/WRITE_ALLOWLIST, ignores the
 * "SNAPSHOTS ↓" marker, and records recomputed Net Worth sums rather than a copy
 * of the live row — so whether Code.gs happened to be present would silently
 * change both the destination and the meaning of a snapshot.
 */
function takeSnapshot() {
  return withLock_(function () {
    var sh = sheet_('History');
    var liveRow = sh.getRange('A2:G2').getValues()[0];
    var targetRow = firstEmptySnapshotRow_();
    guardedWrite('takeSnapshot', 'History', 'A' + targetRow + ':G' + targetRow, [liveRow]);
    return { history: readHistory_(SpreadsheetApp.getActive()) };
  });
}
