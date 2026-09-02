/**
 * Income Sheet — Model Extractor  (MIGRATION TOOL, run once, editor-only)
 * ----------------------------------------------------------------------
 * WHY THIS EXISTS
 *   The app's financial logic does not live in this repo. It lives in the
 *   spreadsheet's formulas, which nothing here can read. Before we can port
 *   the model to a real database we have to get it out and version-control
 *   it. This file does that and nothing else.
 *
 * HOW TO RUN — use a STANDALONE script, not the bound one
 *   1. script.google.com -> New project (a fresh, standalone project)
 *   2. Paste this whole file in, save
 *   3. Select function "dumpModel", press Run
 *   4. Approve the Sheets + Drive permission prompt (first run only)
 *   5. The execution log prints a URL. Download that JSON, drop it in the
 *      repo at  migration/sheet-dump.json
 *
 * WHY STANDALONE: this script needs Drive access to write the dump file.
 * Adding that scope to the sheet-bound project would widen the scopes of the
 * deployed web app too, forcing a re-authorization of a production app for
 * the sake of a one-time migration tool. A throwaway standalone project keeps
 * the running app untouched. Delete the project when you are done.
 *
 * It still works if pasted into the bound project (it falls back to
 * getActive()), but prefer standalone.
 *
 * SAFE: reads only. It never writes to the spreadsheet, never changes a
 * format, never touches a formula. The single side effect is one new JSON
 * file in your Drive.
 */

// The sheet this app was built around. Only used when running standalone.
var DUMP_SHEET_ID = '1Qly9tW7HHAIuHFbxxqgdwrfaYw1-H2QWlKo_RkEDTzc';

var DUMP_INPUT_YELLOW = '#fff2cc';  // the sheet's "you may type here" colour
var DUMP_MAX_ROWS = 5000;           // cap per sheet; Transactions is the long one

// ============================ ENTRY POINTS ============================

/** Full extraction -> JSON file in Drive. This is the one you run. */
function dumpModel() {
  var model = buildModel_();
  var json = JSON.stringify(model, dumpReplacer_, 2);
  var name = 'sheet-dump-' + Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd-HHmm') + '.json';
  var file = DriveApp.createFile(name, json, MimeType.PLAIN_TEXT);

  Logger.log('=========================================================');
  Logger.log('WROTE  %s  (%s KB)', name, Math.round(json.length / 1024));
  Logger.log('URL    %s', file.getUrl());
  Logger.log('DOWNLOAD  %s', 'https://drive.google.com/uc?export=download&id=' + file.getId());
  Logger.log('=========================================================');
  Logger.log('Next: save it in the repo as  migration/sheet-dump.json');
  return file.getUrl();
}

/** Compact overview printed to the log — a fast sanity check before dumpModel. */
function dumpSummary() {
  var ss = openTarget_();
  var sheets = ss.getSheets();
  Logger.log('Spreadsheet: %s  (%s tabs, tz=%s)', ss.getName(), sheets.length, ss.getSpreadsheetTimeZone());
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var dr = sh.getDataRange();
    var f = 0, y = 0;
    var fs = dr.getFormulas(), bg = dr.getBackgrounds();
    for (var r = 0; r < fs.length; r++) {
      for (var c = 0; c < fs[r].length; c++) {
        if (fs[r][c]) f++;
        if (String(bg[r][c]).toLowerCase() === DUMP_INPUT_YELLOW) y++;
      }
    }
    Logger.log('  %s — used %s, %s formulas, %s input cells%s',
      sh.getName(), dr.getA1Notation(), f, y, sh.isSheetHidden() ? ' [hidden]' : '');
  }
}

// ============================ EXTRACTION ============================

function buildModel_() {
  var ss = openTarget_();
  var out = {
    extractedAt: new Date().toISOString(),
    spreadsheet: {
      id: ss.getId(),
      name: ss.getName(),
      timeZone: ss.getSpreadsheetTimeZone(),
      locale: ss.getSpreadsheetLocale(),
      url: ss.getUrl()
    },
    namedRanges: dumpNamedRanges_(ss),
    sheets: []
  };
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) out.sheets.push(dumpSheet_(sheets[i]));
  return out;
}

function dumpNamedRanges_(ss) {
  var out = [];
  var nrs = ss.getNamedRanges();
  for (var i = 0; i < nrs.length; i++) {
    try {
      var r = nrs[i].getRange();
      out.push({ name: nrs[i].getName(), sheet: r.getSheet().getName(), a1: r.getA1Notation() });
    } catch (e) { out.push({ name: nrs[i].getName(), error: String(e) }); }
  }
  return out;
}

function dumpSheet_(sh) {
  var dr = sh.getDataRange();
  var rows = Math.min(dr.getNumRows(), DUMP_MAX_ROWS);
  var cols = dr.getNumColumns();
  var rng = sh.getRange(1, 1, rows, cols);

  var meta = {
    name: sh.getName(),
    gid: sh.getSheetId(),
    index: sh.getIndex(),
    hidden: sh.isSheetHidden(),
    maxRows: sh.getMaxRows(),
    maxColumns: sh.getMaxColumns(),
    frozenRows: sh.getFrozenRows(),
    frozenColumns: sh.getFrozenColumns(),
    usedRange: dr.getA1Notation(),
    dumpedRange: rng.getA1Notation(),
    truncated: dr.getNumRows() > rows
  };

  var values   = rng.getValues();
  var display  = rng.getDisplayValues();
  var formulas = rng.getFormulas();
  var formats  = rng.getNumberFormats();
  var bgs      = rng.getBackgrounds();

  // Cells, sparse: skip anything with no value, no formula and no input colour.
  var cells = [];
  var inputCells = [];
  var formatByRange = {};
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var a1 = colLetter_(c + 1) + (r + 1);
      var isInput = String(bgs[r][c]).toLowerCase() === DUMP_INPUT_YELLOW;
      if (isInput) inputCells.push(a1);

      var v = values[r][c];
      var fx = formulas[r][c];
      var blank = (v === '' || v === null) && !fx;
      if (blank && !isInput) continue;

      var cell = { a1: a1 };
      if (fx) cell.formula = fx;
      if (!blank) {
        cell.value = v;
        cell.display = display[r][c];
        cell.type = jsType_(v);
      }
      if (isInput) cell.input = true;
      var nf = formats[r][c];
      if (nf && nf !== '0.###############') cell.format = nf;
      cells.push(cell);

      if (nf) (formatByRange[nf] = formatByRange[nf] || []).push(a1);
    }
  }

  return {
    meta: meta,
    formulaCount: cells.filter(function (x) { return !!x.formula; }).length,
    inputCells: inputCells,
    numberFormats: summariseFormats_(formatByRange),
    dataValidations: dumpValidations_(rng, rows, cols),
    conditionalFormats: dumpConditionalFormats_(sh),
    cells: cells
  };
}

/** Distinct number formats and how many cells use each — the rendering contract. */
function summariseFormats_(byRange) {
  var out = [];
  for (var f in byRange) {
    out.push({ format: f, count: byRange[f].length, sample: byRange[f].slice(0, 5) });
  }
  out.sort(function (a, b) { return b.count - a.count; });
  return out;
}

/** Dropdowns and checkboxes — these become enums and booleans in the schema. */
function dumpValidations_(rng, rows, cols) {
  var out = [];
  var dvs;
  try { dvs = rng.getDataValidations(); } catch (e) { return [{ error: String(e) }]; }
  var seen = {};
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var dv = dvs[r][c];
      if (!dv) continue;
      var rule = { type: String(dv.getCriteriaType()), args: [] };
      try {
        var args = dv.getCriteriaValues();
        for (var i = 0; i < args.length; i++) {
          var a = args[i];
          rule.args.push(a && a.getA1Notation ? a.getA1Notation() : a);
        }
      } catch (e) { rule.argsError = String(e); }
      var key = JSON.stringify(rule);
      if (!seen[key]) { seen[key] = { rule: rule, cells: [] }; out.push(seen[key]); }
      seen[key].cells.push(colLetter_(c + 1) + (r + 1));
    }
  }
  // Keep it readable: collapse cell lists to first/last plus a count.
  for (var j = 0; j < out.length; j++) {
    var cs = out[j].cells;
    out[j].cellCount = cs.length;
    out[j].cells = cs.length > 8 ? [cs[0], '…', cs[cs.length - 1]] : cs;
  }
  return out;
}

/** Colour rules encode status logic (overdue / paid) we must reproduce. */
function dumpConditionalFormats_(sh) {
  var out = [];
  var rules;
  try { rules = sh.getConditionalFormatRules(); } catch (e) { return [{ error: String(e) }]; }
  for (var i = 0; i < rules.length; i++) {
    var entry = {};
    try {
      var rs = rules[i].getRanges(), a1 = [];
      for (var k = 0; k < rs.length; k++) a1.push(rs[k].getA1Notation());
      entry.ranges = a1;
      var bc = rules[i].getBooleanCondition();
      if (bc) {
        entry.criteria = String(bc.getCriteriaType());
        entry.values = bc.getCriteriaValues();
        entry.background = bc.getBackgroundObject() ? bc.getBackgroundObject().asRgbColor().asHexString() : null;
        entry.fontColor = bc.getFontColorObject() ? bc.getFontColorObject().asRgbColor().asHexString() : null;
      } else {
        entry.gradient = true;
      }
    } catch (e) { entry.error = String(e); }
    out.push(entry);
  }
  return out;
}

// ============================ HELPERS ============================

/**
 * The target spreadsheet. Standalone projects have no active spreadsheet, so
 * open by id; bound projects use whatever they are bound to, which lets the
 * same file work either way.
 */
function openTarget_() {
  var active = null;
  try { active = SpreadsheetApp.getActive(); } catch (e) { active = null; }
  if (active) return active;
  if (!DUMP_SHEET_ID) throw new Error('Set DUMP_SHEET_ID to the spreadsheet id.');
  return SpreadsheetApp.openById(DUMP_SHEET_ID);
}

function jsType_(v) {
  if (v instanceof Date) return 'date';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

function colLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = (n - m - 1) / 26;
  }
  return s;
}

/** Dates cross into JSON as ISO strings, not as {} . */
function dumpReplacer_(key, value) {
  if (this[key] instanceof Date) return this[key].toISOString();
  return value;
}
