/**
 * Income Sheet — Full UI Beautifier for Google Sheets
 * ---------------------------------------------------
 * HOW TO RUN:
 *   1. Open your Google Sheet
 *   2. Extensions  ->  Apps Script
 *   3. Delete whatever code is there, paste ALL of this file
 *   4. Save (disk icon), pick function "beautifyAll", press Run
 *   5. Approve the permission prompt the first time (it's your own sheet)
 *
 * Safe to run more than once — it only changes formatting, never your numbers.
 */

// ============================ PALETTE ============================

var NAVY    = '#1F3864';
var BLUE    = '#2E75B6';
var LIGHT   = '#D9E2F2';
var BAND    = '#EEF3FA';
var YELLOW  = '#FFF2CC';
var GREEN_F = '#E2EFDA', GREEN_T = '#375623';
var RED_F   = '#FCE4E4', RED_T   = '#9C0006';
var AMBER_F = '#FFF3CD', AMBER_T = '#8A6D00';
var GRAY_T  = '#595959';
var WHITE   = '#FFFFFF';
var BLUE_IN = '#0000FF';   // input-cell font
var BORDER  = '#BFBFBF';

var EGP  = '#,##0';
var EGP2 = '#,##0.00';
var USD  = '$#,##0.00';
var RATE = '#,##0.00';
var DATEF= 'mm/dd/yyyy';
var PCT  = '0.0%';

// Installments body span. Must match the 2:500 ranges fixFormulas_ writes and
// the rows setInstallmentPaid() is willing to touch, or rows past the cut-off
// get no date/currency format and no overdue highlight.
var INST_LAST = 500;

// ============================ ENTRY POINT ============================
function beautifyAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  baseline_(ss);
  fixFormulas_(ss);

  dashboard_(ss);
  dataSheet_(ss);
  totalSheet_(ss);
  installments_(ss);
  investment_(ss);
  rates_(ss);
  netWorth_(ss);
  transactions_(ss);
  history_(ss);

  var dash = ss.getSheetByName('Dashboard');
  if (dash) ss.setActiveSheet(dash);

  // getUi() throws when this runs from google.script.run or a trigger. All the
  // work is already done by here, so a failed notification must not surface as
  // a failed run.
  try {
    SpreadsheetApp.getUi().alert('Done — all sheets restyled.');
  } catch (e) {
    Logger.log('Done — all sheets restyled.');
  }
}

// ============================ HELPERS ============================
function sh_(ss, name) { return ss.getSheetByName(name); }

/** Arial everywhere, clear old formatting rules, remove the £ currency leftovers. */
function baseline_(ss) {
  ss.getSheets().forEach(function (s) {
    s.getDataRange().setFontFamily('Arial').setFontSize(10);
    s.setConditionalFormatRules([]);
    // strip inherited row banding
    s.getBandings().forEach(function (b) { b.remove(); });
  });
}

/** Repair functions that don't survive the .xlsx import. */
function fixFormulas_(ss) {
  var ins = sh_(ss, 'Installments');
  if (!ins) return;
  ins.getRange('H5').setFormula(
    '=MINIFS(B2:B500,E2:E500,"No",B2:B500,">="&TODAY())');
  ins.getRange('H2').setFormula('=SUM(C2:C500)');
  ins.getRange('H3').setFormula('=SUMIFS(C2:C500,E2:E500,"Yes")');
  ins.getRange('H4').setFormula('=SUMIFS(C2:C500,E2:E500,"No")');
  ins.getRange('H6').setFormula('=SUMIFS(C2:C500,B2:B500,H5,E2:E500,"No")');
  ins.getRange('H7').setFormula('=SUMIFS(C2:C500,E2:E500,"No",B2:B500,">="&TODAY(),B2:B500,"<="&EDATE(TODAY(),3))');
  ins.getRange('H8').setFormula('=SUMIFS(C2:C500,E2:E500,"No",B2:B500,">="&TODAY(),B2:B500,"<="&EDATE(TODAY(),6))');
  ins.getRange('H9').setFormula('=SUMIFS(C2:C500,E2:E500,"No",B2:B500,">="&TODAY(),B2:B500,"<="&EDATE(TODAY(),12))');
  ins.getRange('H10').setFormula('=SUMIFS(C2:C500,E2:E500,"No",B2:B500,"<"&TODAY())');
}

/** Dark header strip. */
function header_(sheet, a1, color) {
  sheet.getRange(a1)
    .setBackground(color || NAVY)
    .setFontColor(WHITE)
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(sheet.getRange(a1).getRow(), 34);
}

/** Alternating row colour + grid. */
function bandBody_(sheet, a1) {
  var rng = sheet.getRange(a1);
  rng.setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
  var banding = rng.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  banding.setFirstRowColor(WHITE).setSecondRowColor(BAND);
}

/** Yellow + blue = "you edit this". */
function inputCells_(sheet, a1) {
  sheet.getRange(a1).setBackground(YELLOW).setFontColor(BLUE_IN).setFontWeight('bold');
}

function widths_(sheet, arr) {
  arr.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
}

// ============================ DASHBOARD ============================
function dashboard_(ss) {
  var s = sh_(ss, 'Dashboard');
  if (!s) return;
  s.setTabColor(NAVY);
  s.setHiddenGridlines(true);

  // Title banner
  s.getRange('A1:C1').merge()
    .setBackground(NAVY).setFontColor(WHITE)
    .setFontSize(16).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  s.setRowHeight(1, 40);

  // KPI block A3:C12
  var kpi = s.getRange('A3:C12');
  kpi.setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
  s.getRange('A3:A12').setFontWeight('bold').setFontColor(GRAY_T).setVerticalAlignment('middle');
  s.getRange('B3:C12').setFontWeight('bold').setFontColor(NAVY)
    .setHorizontalAlignment('right').setVerticalAlignment('middle');
  s.getRange('B3:B8').setNumberFormat(EGP);
  s.getRange('B3:B4').setFontSize(13);
  s.getRange('B9').setNumberFormat(DATEF);
  s.getRange('C9').setNumberFormat(EGP);
  s.getRange('B10:B11').setNumberFormat(EGP);
  s.getRange('B12').setNumberFormat(RATE);
  for (var r = 3; r <= 12; r++) {
    s.setRowHeight(r, 24);
    if (r % 2 === 1) s.getRange(r, 1, 1, 3).setBackground(BAND);
  }

  // Asset table E1:F6
  header_(s, 'E1:F1', BLUE);
  bandBody_(s, 'E2:F6');
  s.getRange('F2:F6').setNumberFormat(EGP).setHorizontalAlignment('right');

  // Year table H1:I22
  header_(s, 'H1:I1', BLUE);
  bandBody_(s, 'H2:I22');
  s.getRange('H2:H22').setHorizontalAlignment('center');
  s.getRange('I2:I22').setNumberFormat(EGP).setHorizontalAlignment('right');

  // Colour scale on the unpaid-installments column
  var rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#FFFFFF', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setGradientMaxpoint('#2E75B6')
    .setRanges([s.getRange('I2:I22')])
    .build());
  s.setConditionalFormatRules(rules);

  widths_(s, [230, 120, 105, 20, 175, 110, 20, 65, 185]);

  // Charts — clear old, build fresh
  s.getCharts().forEach(function (c) { s.removeChart(c); });

  var bar = s.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(s.getRange('H1:I22'))
    .setPosition(15, 5, 0, 0)
    .setOption('title', 'Unpaid Installments by Year')
    .setOption('legend', { position: 'none' })
    .setOption('colors', [BLUE])
    .setOption('width', 520).setOption('height', 300)
    .build();
  s.insertChart(bar);

  var pie = s.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(s.getRange('E1:F6'))
    .setPosition(15, 1, 0, 0)
    .setOption('title', 'Asset Mix (EGP)')
    .setOption('pieHole', 0.4)
    .setOption('width', 380).setOption('height', 300)
    .build();
  s.insertChart(pie);
}

// ============================ DATA ============================
function dataSheet_(ss) {
  var s = sh_(ss, 'Data');
  if (!s) return;
  s.setTabColor(BLUE);
  s.setFrozenRows(1);
  header_(s, 'A1:E1');
  bandBody_(s, 'A2:E18');

  s.getRange('D2:D18').setNumberFormat(EGP2).setHorizontalAlignment('right');
  s.getRange('E2:E18').setNumberFormat(DATEF);
  s.getRange('B2:C18').setHorizontalAlignment('center');
  inputCells_(s, 'D2:D200');

  s.getRange('B2:B200').setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['USD', 'EGP', 'Gold', 'Silver', 'Liability'], true)
      .setAllowInvalid(false).build());
  // insertCheckboxes() sets every cell in the range to FALSE, and Data!C is the
  // account "investment" flag the app reads and writes. Capture it first and put
  // it back, so re-running this stays formatting-only.
  var flags = s.getRange('C2:C200');
  var wasChecked = flags.getValues();
  flags.insertCheckboxes();
  flags.setValues(wasChecked.map(function (row) {
    return [row[0] === true || String(row[0]).toUpperCase() === 'TRUE'];
  }));

  widths_(s, [140, 100, 100, 120, 110]);
}

// ============================ TOTAL ============================
function totalSheet_(ss) {
  var s = sh_(ss, 'Total');
  if (!s) return;
  s.setTabColor(BLUE);
  header_(s, 'A1:L1');
  s.getRange('A2:L2')
    .setFontWeight('bold').setFontColor(NAVY)
    .setHorizontalAlignment('right').setBackground(LIGHT)
    .setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
  s.getRange('A2').setNumberFormat(RATE);
  s.getRange('B2:C2').setNumberFormat(EGP);
  s.getRange('D2').setNumberFormat(USD);
  s.getRange('E2').setNumberFormat(EGP2);
  s.getRange('F2').setNumberFormat(EGP2);
  s.getRange('G2').setNumberFormat(EGP2);
  s.getRange('H2').setNumberFormat(EGP2);
  s.getRange('I2:L2').setNumberFormat(EGP2);
  s.setRowHeight(2, 26);
  var a3 = s.getRange('A3');                // stray newline cell from the import
  if (String(a3.getValue()).trim() === '') a3.clearContent();

  // Liability sub-table
  header_(s, 'I3:J3', BLUE);
  bandBody_(s, 'I4:J10');
  s.getRange('J4:J10').setNumberFormat(EGP).setHorizontalAlignment('right');
  inputCells_(s, 'J6:J10');

  for (var c = 1; c <= 12; c++) s.setColumnWidth(c, 125);
}

// ============================ INSTALLMENTS ============================
function installments_(ss) {
  var s = sh_(ss, 'Installments');
  if (!s) return;
  s.setTabColor('#C00000');
  s.setFrozenRows(1);

  header_(s, 'A1:E1');
  var body = s.getRange('A2:E' + INST_LAST);
  body.setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
  s.getRange('B2:B' + INST_LAST).setNumberFormat(DATEF).setHorizontalAlignment('center');
  s.getRange('C2:C' + INST_LAST).setNumberFormat(EGP2).setHorizontalAlignment('right');
  s.getRange('E2:E' + INST_LAST).setHorizontalAlignment('center');

  s.getRange('E2:E' + INST_LAST).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Yes', 'No'], true)
      .setAllowInvalid(false).build());

  // Row-level status colours
  var rng = [s.getRange('A2:E' + INST_LAST)];
  var rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()          // paid
    .whenFormulaSatisfied('=$E2="Yes"')
    .setBackground(GREEN_F).setFontColor(GREEN_T)
    .setRanges(rng).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()          // overdue
    .whenFormulaSatisfied('=AND($E2="No",$B2<TODAY())')
    .setBackground(RED_F).setFontColor(RED_T).setBold(true)
    .setRanges(rng).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()          // due within 3 months
    .whenFormulaSatisfied('=AND($E2="No",$B2>=TODAY(),$B2<=EDATE(TODAY(),3))')
    .setBackground(AMBER_F).setFontColor(AMBER_T).setBold(true)
    .setRanges(rng).build());
  s.setConditionalFormatRules(rules);

  // Summary card
  s.getRange('G1:H1').merge()
    .setBackground(NAVY).setFontColor(WHITE).setFontWeight('bold').setFontSize(11)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  s.getRange('G2:H10')
    .setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
  s.getRange('G2:G10').setFontWeight('bold').setFontColor(GRAY_T);
  s.getRange('H2:H10').setFontWeight('bold').setFontColor(NAVY)
    .setHorizontalAlignment('right').setNumberFormat(EGP);
  s.getRange('H5').setNumberFormat(DATEF);
  for (var r = 2; r <= 10; r++) {
    s.setRowHeight(r, 22);
    if (r % 2 === 0) s.getRange(r, 7, 1, 2).setBackground(BAND);
  }

  widths_(s, [130, 105, 165, 175, 70, 20, 165, 125]);
}

// ============================ INVESTMENT ============================
function investment_(ss) {
  var s = sh_(ss, 'Investment');
  if (!s) return;
  s.setTabColor(BLUE);
  header_(s, 'A1:K1');
  s.getRange('A2:K2')
    .setFontWeight('bold').setFontColor(NAVY).setBackground(LIGHT)
    .setHorizontalAlignment('right')
    .setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
  s.getRange('A2').setNumberFormat(RATE);
  s.getRange('B2:C2').setNumberFormat(EGP);
  s.getRange('D2').setNumberFormat(USD);
  s.getRange('E2').setNumberFormat(EGP2);
  s.getRange('F2:G2').setNumberFormat(EGP2);
  s.getRange('H2:K2').setNumberFormat(EGP2);
  s.setRowHeight(2, 26);
  for (var c = 1; c <= 11; c++) s.setColumnWidth(c, 125);
}

// ============================ RATES ============================
function rates_(ss) {
  var s = sh_(ss, 'Rates');
  if (!s) return;
  s.setTabColor('#FFC000');
  header_(s, 'A1:C1');
  bandBody_(s, 'A2:C4');
  s.getRange('B2:B4').setNumberFormat(RATE).setHorizontalAlignment('right').setFontSize(11);
  s.getRange('B2').setNumberFormat('#,##0.0000');
  s.getRange('C2:C4').setNumberFormat(DATEF).setHorizontalAlignment('center');
  inputCells_(s, 'B2:B4');
  s.getRange('A6').setFontStyle('italic').setFontColor(GRAY_T).setFontSize(9);
  widths_(s, [175, 115, 105]);
}

// ============================ NET WORTH ============================
function netWorth_(ss) {
  var s = sh_(ss, 'Net Worth');
  if (!s) return;
  s.setTabColor(GREEN_T);
  s.setHiddenGridlines(true);

  s.getRange('A1:B1').merge()
    .setBackground(NAVY).setFontColor(WHITE)
    .setFontSize(16).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  s.setRowHeight(1, 40);

  [3, 14].forEach(function (r) {
    s.getRange(r, 1, 1, 2)
      .setBackground(BLUE).setFontColor(WHITE).setFontWeight('bold').setFontSize(11)
      .setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
    s.getRange(r, 2).setHorizontalAlignment('right');
    s.setRowHeight(r, 26);
  });

  [[4, 11], [15, 16]].forEach(function (span) {
    for (var r = span[0]; r <= span[1]; r++) {
      s.getRange(r, 1, 1, 2)
        .setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
      s.getRange(r, 2).setNumberFormat(EGP).setHorizontalAlignment('right');
      s.setRowHeight(r, 22);
      if (r % 2 === 0) s.getRange(r, 1, 1, 2).setBackground(BAND);
    }
  });

  inputCells_(s, 'B9:B11');                          // property paid-to-date inputs

  [12, 17].forEach(function (r) {                    // totals
    s.getRange(r, 1, 1, 2)
      .setBackground(LIGHT).setFontWeight('bold').setFontColor(NAVY)
      .setBorder(true, true, true, true, null, null, NAVY, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    s.getRange(r, 2).setNumberFormat(EGP).setHorizontalAlignment('right');
  });

  [19, 20].forEach(function (r) {                    // net worth highlight
    s.getRange(r, 1, 1, 2)
      .setBackground(GREEN_F).setFontColor(GREEN_T).setFontWeight('bold').setFontSize(11)
      .setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
    s.getRange(r, 2).setNumberFormat(EGP).setHorizontalAlignment('right');
    s.setRowHeight(r, 26);
  });

  widths_(s, [320, 150]);
}

// ============================ TRANSACTIONS ============================
function transactions_(ss) {
  var s = sh_(ss, 'Transactions');
  if (!s) return;
  s.setTabColor('#7030A0');
  s.setFrozenRows(1);

  header_(s, 'A1:H1');
  header_(s, 'J1:N1', BLUE);
  bandBody_(s, 'A2:H60');
  bandBody_(s, 'J2:N25');

  s.getRange('A2:A500').setNumberFormat(DATEF);
  s.getRange('E2:E500').setNumberFormat(EGP2).setHorizontalAlignment('right');
  s.getRange('G2:G500').setNumberFormat(EGP2).setHorizontalAlignment('right');
  s.getRange('B2:B500').setHorizontalAlignment('center');
  s.getRange('F2:F500').setHorizontalAlignment('center');

  s.getRange('J2:J25').setNumberFormat('mmm yyyy').setHorizontalAlignment('center');
  s.getRange('K2:M25').setNumberFormat(EGP).setHorizontalAlignment('right');
  s.getRange('N2:N25').setNumberFormat(PCT).setHorizontalAlignment('right');

  // Dropdowns
  s.getRange('B2:B500').setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Income', 'Expense', 'Transfer'], true)
      .setAllowInvalid(false).build());
  s.getRange('C2:C500').setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Salary', 'Freelance', 'Food', 'Transport', 'Rent',
        'Utilities', 'Shopping', 'Health', 'Education', 'Entertainment',
        'Installment', 'Investment', 'Other'], true)
      .setAllowInvalid(false).build());
  var dataSh = sh_(ss, 'Data');
  if (dataSh) {
    // A2:A200, not A2:A18 — addAccount() appends past row 18 and this dropdown
    // rejects invalid input, so a short range makes new accounts unselectable.
    s.getRange('D2:D500').setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(dataSh.getRange('A2:A200'), true)
        .setAllowInvalid(false).build());
  }
  s.getRange('F2:F500').setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['EGP', 'USD'], true)
      .setAllowInvalid(false).build());

  // Income green / expense red on the Type column
  var rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Income')
    .setBackground(GREEN_F).setFontColor(GREEN_T).setBold(true)
    .setRanges([s.getRange('B2:B500')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Expense')
    .setBackground(RED_F).setFontColor(RED_T).setBold(true)
    .setRanges([s.getRange('B2:B500')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()       // negative savings
    .whenNumberLessThan(0)
    .setFontColor(RED_T).setBold(true)
    .setRanges([s.getRange('M2:M25')]).build());
  s.setConditionalFormatRules(rules);

  widths_(s, [100, 95, 120, 115, 100, 80, 115, 190, 20, 95, 120, 120, 120, 100]);
}

// ============================ HISTORY ============================
function history_(ss) {
  var s = sh_(ss, 'History');
  if (!s) return;
  s.setTabColor(GRAY_T);
  s.setFrozenRows(1);
  header_(s, 'A1:G1');
  s.getRange('A2:G2')
    .setBackground(LIGHT).setFontWeight('bold').setFontColor(NAVY)
    .setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
  s.getRange('A3').setFontWeight('bold').setFontColor(GRAY_T);
  var last = Math.max(s.getLastRow(), 4);
  s.getRange('A2:A' + last).setNumberFormat(DATEF).setHorizontalAlignment('center');
  s.getRange('B2:G' + last).setNumberFormat(EGP).setHorizontalAlignment('right');
  s.getRange('A4:G' + last)
    .setBorder(true, true, true, true, true, true, BORDER, SpreadsheetApp.BorderStyle.SOLID);
  widths_(s, [105, 130, 145, 160, 175, 175, 140]);
}

/**
 * Optional: appends today's numbers as a new snapshot row on the History sheet.
 * Run it manually whenever you want to log a point in time.
 */
function addSnapshot() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nw = sh_(ss, 'Net Worth');
  var h  = sh_(ss, 'History');
  if (!nw || !h) throw new Error('addSnapshot needs both the "Net Worth" and "History" tabs.');
  h.appendRow([
    new Date(),
    nw.getRange('B4').getValue() + nw.getRange('B5').getValue() +
      nw.getRange('B6').getValue() + nw.getRange('B7').getValue(),
    nw.getRange('B8').getValue(),
    nw.getRange('B9').getValue() + nw.getRange('B10').getValue() + nw.getRange('B11').getValue(),
    nw.getRange('B15').getValue(),
    nw.getRange('B16').getValue(),
    nw.getRange('B20').getValue()
  ]);
  history_(ss);
}

// ===================== CX AUDIT (added by Claude, read-only) =====================
function cxAudit() {
  var ss = SpreadsheetApp.getActive();
  var out = [];
  ss.getSheets().forEach(function(s){
    var lr = s.getLastRow(), lc = s.getLastColumn();
    var o = {n:s.getName(), lr:lr, lc:lc, froz:s.getFrozenRows(), grid:(s.hasHiddenGridlines()?'hidden':'SHOWN')};
    var maxC = Math.max(1, Math.min(lc+1, 16));
    var w = []; for (var c=1;c<=maxC;c++) w.push(s.getColumnWidth(c));
    o.w = w.join(',');
    var rh = []; for (var r=1;r<=Math.min(Math.max(lr,1),10);r++) rh.push(s.getRowHeight(r));
    o.rh = rh.join(',');
    if (lr>0 && lc>0) {
      var n = Math.min(lr, 600);
      var rng = s.getRange(1,1,n,maxC);
      var dv = rng.getDisplayValues(), fs = rng.getFontSizes(), wr = rng.getWrapStrategies();
      var info = [];
      for (var c=0;c<maxC;c++){
        var mx=0, mxr=0, f=10, wstr='';
        for (var r=0;r<n;r++){
          var t = String(dv[r][c]===null?'':dv[r][c]);
          if (t.length>mx){ mx=t.length; mxr=r+1; f=fs[r][c]; wstr=String(wr[r][c]); }
        }
        info.push((c+1)+':len'+mx+'@r'+mxr+'/f'+f+'/'+wstr.substring(0,4));
      }
      o.longest = info.join(' | ');
      o.merges = s.getRange(1,1,Math.min(lr,80),maxC).getMergedRanges().map(function(x){return x.getA1Notation();}).join(',');
    }
    o.cf = s.getConditionalFormatRules().map(function(r){
      var rs = r.getRanges().map(function(x){return x.getA1Notation();}).join('+');
      var b = r.getBooleanCondition();
      return rs+'=>'+(b ? b.getCriteriaType()+':'+JSON.stringify(b.getCriteriaValues().map(String)).substring(0,120) : 'GRADIENT');
    }).join(' || ');
    o.charts = s.getCharts().map(function(ch){
      var ci = ch.getContainerInfo(); var op = ch.getOptions();
      function g(k){ try { return op.get(k); } catch(e){ return '?'; } }
      return 'anchor r'+ci.getAnchorRow()+'c'+ci.getAnchorColumn()+' off('+ci.getOffsetX()+','+ci.getOffsetY()+') size '+g('width')+'x'+g('height')+' title='+g('title');
    }).join(' || ');
    out.push(o);
  });
  out.forEach(function(o){ Logger.log(JSON.stringify(o)); });
}


function cxAudit2() {
  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function(s){
    var lr = Math.min(s.getLastRow(), 200), lc = s.getLastColumn();
    if (!lr || !lc) return;
    var nf = s.getRange(1,1,lr,lc).getNumberFormats();
    var set = {};
    nf.forEach(function(row){ row.forEach(function(f){ set[f] = (set[f]||0)+1; }); });
    Logger.log('##NF ' + s.getName() + ' ' + JSON.stringify(set).substring(0,500));
  });
  var chk = [['Data','C2'],['Data','C18'],['Data','C25'],['Installments','E3'],['Installments','E30'],['Transactions','B2'],['Transactions','C2'],['Transactions','D2'],['Transactions','F2'],['Transactions','B300']];
  chk.forEach(function(p){
    var s = ss.getSheetByName(p[0]);
    var v = s.getRange(p[1]).getDataValidation();
    var txt = 'NONE';
    if (v) { txt = v.getCriteriaType() + ' ' + JSON.stringify(v.getCriteriaValues().map(function(x){ return String(x); })).substring(0,180); }
    Logger.log('##DV ' + p[0] + '!' + p[1] + ' = ' + txt);
  });
  var d = ss.getSheetByName('Data');
  Logger.log('##DATAC ' + JSON.stringify(d.getRange('C1:C22').getValues().map(function(x){ return typeof x[0]; })));
  Logger.log('##TOTAL ' + JSON.stringify(ss.getSheetByName('Total').getRange('A1:L10').getDisplayValues()).substring(0,1400));
  Logger.log('##RATES ' + JSON.stringify(ss.getSheetByName('Rates').getRange('A1:C6').getDisplayValues()));
  Logger.log('##NW ' + JSON.stringify(ss.getSheetByName('Net Worth').getRange('A1:B20').getDisplayValues()).substring(0,1200));
  Logger.log('##DASH ' + JSON.stringify(ss.getSheetByName('Dashboard').getRange('A1:I22').getDisplayValues()).substring(0,1600));
  Logger.log('##TX ' + JSON.stringify(ss.getSheetByName('Transactions').getRange('A1:N4').getDisplayValues()).substring(0,1200));
  Logger.log('##HIST ' + JSON.stringify(ss.getSheetByName('History').getRange('A1:G4').getDisplayValues()).substring(0,900));
  Logger.log('##INST ' + JSON.stringify(ss.getSheetByName('Installments').getRange('A1:H10').getDisplayValues()).substring(0,1200));
  Logger.log('##INV ' + JSON.stringify(ss.getSheetByName('Investment').getRange('A1:K2').getDisplayValues()).substring(0,900));
  var cfi = ss.getSheetByName('Installments').getConditionalFormatRules();
  cfi.forEach(function(r,i){
    var b = r.getBooleanCondition();
    Logger.log('##CFI ' + i + ' ' + r.getRanges().map(function(x){return x.getA1Notation();}).join('+') + ' :: ' + (b ? b.getCriteriaType() + ' ' + JSON.stringify(b.getCriteriaValues().map(String)) + ' bg=' + b.getBackgroundObject().asRgbColor().asHexString() : 'grad'));
  });
}


function cxAudit3() {
  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function(s){
    var lr = Math.min(s.getLastRow(), 600), lc = s.getLastColumn();
    if (!lr || !lc) return;
    var rg = s.getRange(1,1,lr,lc);
    var nf = rg.getNumberFormats();
    var hits = [];
    for (var r=0;r<nf.length;r++) for (var c=0;c<lc;c++) {
      var f = nf[r][c];
      if (/[$\u00A3\u20AC]/.test(f)) hits.push(s.getRange(r+1,c+1).getA1Notation()+'='+f);
    }
    if (hits.length) Logger.log('$$CUR ' + s.getName() + ' :: ' + hits.join(' ; ').substring(0,700));
    var dh = [];
    for (var r2=0;r2<nf.length;r2++) for (var c2=0;c2<lc;c2++) {
      var f2 = nf[r2][c2];
      if (/y/.test(f2) && f2 !== 'mm/dd/yyyy' && f2 !== 'mmm yyyy') dh.push(s.getRange(r2+1,c2+1).getA1Notation()+'='+f2);
    }
    if (dh.length) Logger.log('$$DATE ' + s.getName() + ' :: n=' + dh.length + ' ' + dh.slice(0,6).join(' ; ') + ' ... ' + dh[dh.length-1]);
  });
  var tx = ss.getSheetByName('Transactions');
  Logger.log('$$TXBG ' + JSON.stringify(tx.getRange('A2:H6').getBackgrounds()) + ' | r490 ' + JSON.stringify(tx.getRange('A490:H492').getBackgrounds()));
  var da = ss.getSheetByName('Data');
  Logger.log('$$DATABG rows18-22 ' + JSON.stringify(da.getRange('A18:E22').getBackgrounds()) + ' vals ' + JSON.stringify(da.getRange('A18:E22').getDisplayValues()));
  Logger.log('$$DATABND ' + da.getBandings().length + ' ' + JSON.stringify(da.getBandings().map(function(b){return b.getRange().getA1Notation();})));
  Logger.log('$$TXBND ' + tx.getBandings().length + ' ' + JSON.stringify(tx.getBandings().map(function(b){return b.getRange().getA1Notation();})));
  var tot = ss.getSheetByName('Total');
  Logger.log('$$ARAB I9 font=' + tot.getRange('I9').getFontFamily() + ' size=' + tot.getRange('I9').getFontSize() + ' halign=' + tot.getRange('I9').getHorizontalAlignment() + ' wrap=' + tot.getRange('I9').getWrapStrategy() + ' w=' + tot.getColumnWidth(9));
}


// ===================== CX FIX (formatting only — no values, no formulas) =====================
function cxFix() {
  var ss = SpreadsheetApp.getActive();
  var log = [];

  // Every block below is guarded: this runs from the "Formatting fixes" menu
  // with no transaction around it, so one renamed tab must not abort the run
  // partway and leave the workbook half-reformatted.
  function skip_(name) { log.push('SKIPPED ' + name + ' — tab not found'); }

  // ---------- DASHBOARD : charts were anchored at row 15 and sat on top of H1:I22 ----------
  var dash = ss.getSheetByName('Dashboard');
  if (!dash) skip_('Dashboard'); else {
    dash.getCharts().forEach(function(ch){
      var title = '';
      try { title = String(ch.getOptions().get('title')); } catch(e) {}
      var b = ch.modify();
      if (title.indexOf('Asset Mix') >= 0) {
        b.setPosition(24, 1, 0, 0).setOption('width', 470).setOption('height', 340);
      } else {
        b.setPosition(24, 5, 0, 0).setOption('width', 555).setOption('height', 340);
      }
      dash.updateChart(b.build());
      log.push('Dashboard chart "' + title + '" moved to row 24');
    });
  }

  // ---------- DATA : giant clipped checkboxes + stray date format + stray yellow ----------
  var data = ss.getSheetByName('Data');
  if (!data) skip_('Data'); else {
    var dMax = data.getMaxRows();
    log.push('Data C19 font size BEFORE = ' + data.getRange('C19').getFontSize() + ', C20 = ' + data.getRange('C20').getFontSize() + ', rowH19 = ' + data.getRowHeight(19));
    if (dMax > 18) {
      var blank = data.getRange(19, 1, dMax - 18, 5);
      blank.setFontFamily('Arial').setFontSize(10).setFontWeight('normal').setFontColor('#000000').setBackground(null);
      // ...but D is the yellow "you edit this" column (dataSheet_ styles D2:D200).
      // Clearing it above would strip that affordance from every account the app
      // appends below row 18, so put it back.
      inputCells_(data, 'D19:D' + Math.min(200, dMax));
      data.getRange(19, 1, dMax - 18, 1).setNumberFormat('0.###############');
      data.setRowHeights(19, dMax - 18, 21);
    }
    data.getRange(2, 5, dMax - 1, 1).setNumberFormat('mm/dd/yyyy');
    log.push('Data: blank rows 19-' + dMax + ' normalised (font 10, height 21, no stray fill), input fill kept on D, col A general, col E mm/dd/yyyy');
  }

  // ---------- TOTAL : legacy Excel currency formats + orphan border box ----------
  var tot = ss.getSheetByName('Total');
  if (!tot) skip_('Total'); else {
    tot.getRange('A3:H10').setNumberFormat('#,##0');
    tot.getRange('K3:L10').setNumberFormat('#,##0');
    tot.getRange('K3:K11').setBorder(false, null, false, false, false, false);
    tot.getRange('L3:L11').setBorder(false, false, false, false, false, false);
    log.push('Total: cleared legacy $/GBP number formats on A3:H10 + K3:L10, removed orphan border box on K');
  }

  // ---------- INSTALLMENTS : legacy GBP format sitting on the C1 header ----------
  var inst = ss.getSheetByName('Installments');
  if (!inst) skip_('Installments'); else {
    inst.getRange('C1').setNumberFormat('#,##0');
    log.push('Installments: cleared legacy GBP format on header C1');
  }

  // ---------- RATES : 88-char footnote spilling past column C ----------
  var rates = ss.getSheetByName('Rates');
  if (!rates) skip_('Rates'); else {
    var note = rates.getRange('A6:C6');
    if (!note.isPartOfMerge()) note.merge();
    note.setWrap(true).setVerticalAlignment('middle');
    rates.setRowHeight(6, 32);
    log.push('Rates: footnote merged across A6:C6 and wrapped');
  }

  // ---------- TRANSACTIONS : cramped 17px rows + banding stopping dead at row 60 ----------
  var tx = ss.getSheetByName('Transactions');
  if (!tx) skip_('Transactions'); else {
    tx.setRowHeights(2, 499, 21);
    var bands = tx.getBandings();
    for (var i = 0; i < bands.length; i++) {
      var a1 = bands[i].getRange().getA1Notation();
      if (a1.indexOf('A2:H') === 0) {
        var c1 = bands[i].getFirstRowColor();
        var c2 = bands[i].getSecondRowColor();
        bands[i].remove();
        var nb = tx.getRange('A2:H500').applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
        nb.setFirstRowColor(c1).setSecondRowColor(c2).setHeaderRowColor(null).setFooterRowColor(null);
        log.push('Transactions: banding extended from ' + a1 + ' to A2:H500 (' + c1 + ' / ' + c2 + ')');
      }
    }
    log.push('Transactions: row heights 2-500 set to 21');
  }

  // ---------- HISTORY : cramped 17px rows ----------
  var hist = ss.getSheetByName('History');
  if (!hist) skip_('History'); else {
    hist.setRowHeights(2, 19, 21);
    log.push('History: row heights 2-20 set to 21');
  }

  SpreadsheetApp.flush();
  log.forEach(function(l){ Logger.log('@@ ' + l); });
}


function cxFix3() {
  var dash = SpreadsheetApp.getActive().getSheetByName('Dashboard');
  if (!dash) return;
  dash.getCharts().forEach(function(ch){
    var title = '';
    try { title = String(ch.getOptions().get('title')); } catch(e) {}
    var b = ch.modify();
    b.setOption('chartArea', {});
    if (title.indexOf('Asset Mix') >= 0) {
      b.setPosition(24, 1, 0, 0).setOption('width', 470).setOption('height', 340).setOption('legend', { position: 'right', textStyle: { fontSize: 11, color: '#595959' } }).setOption('pieSliceText', 'percentage');
    } else {
      b.setPosition(24, 5, 0, 0).setOption('width', 555).setOption('height', 340).setOption('legend', { position: 'none' });
    }
    dash.updateChart(b.build());
    Logger.log('&&3 ' + title);
  });
}


function zzRunAll() {
  // Run each step independently: there is no transaction here, so a failure in
  // one step should not cost the user the steps that already succeeded.
  var failed = [];
  [['cxFix', cxFix], ['cxFix3', cxFix3], ['cxFix4', cxFix4]].forEach(function (step) {
    try {
      step[1]();
    } catch (e) {
      failed.push(step[0] + ': ' + e.message);
      Logger.log('zz FAILED ' + step[0] + ' — ' + e.message);
    }
  });
  Logger.log('zz done' + (failed.length ? ' with ' + failed.length + ' failure(s)' : ''));
  if (failed.length) {
    try {
      SpreadsheetApp.getUi().alert('Some formatting steps failed:\n\n' + failed.join('\n'));
    } catch (e) { /* no UI in this context — the log above has it */ }
  }
}


function onOpen() {
  SpreadsheetApp.getUi().createMenu('Formatting fixes').addItem('Apply formatting fixes', 'zzRunAll').addToUi();
}


function cxFix4() {
  var dash = SpreadsheetApp.getActive().getSheetByName('Dashboard');
  if (!dash) return;
  dash.getCharts().forEach(function(ch){
    var title = '';
    try { title = String(ch.getOptions().get('title')); } catch(e) {}
    if (title.indexOf('Asset Mix') >= 0) return;
    dash.updateChart(ch.modify().setNumHeaders(1).build());
    Logger.log('&&4 header row excluded from ' + title);
  });
}
