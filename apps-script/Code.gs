/**
 * Ethan's Money: link between the phone app and the "E&S Budgie" Google Sheet.
 *
 * Setup (once):
 *   1. Open script.google.com, New project (or Extensions > Apps Script in the sheet). Paste this file into Code.gs. Save.
 *   2. Choose the function "setup" in the toolbar and click Run. Allow access when Google asks.
 *      The log at the bottom shows your app key and a connect link.
 *   3. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy.
 *   4. Copy the Web app URL, then run "connectLink" with it pasted into WEB_APP_URL below,
 *      or paste the URL and key into the app's Settings screen.
 *
 * Security: every request must carry the app key. The key lives only in this script's
 * properties and on your phone. To change it, run "newKey" and reconnect the app.
 */

var WEB_APP_URL = ""; // optional: paste the /exec URL here, then run connectLink()
var APP_URL = "https://alertrobot.github.io/ethan-money/";

var TABS = ["This month", "Budget", "Personal bills", "Car costs", "Savings growth", "Sophie", "Christmas", "App settings"];
var LOG_TAB = "Expense log";
var LOG_FIRST_ROW = 5;
var BLUE = "#0000ff";

// ---------- setup helpers (run from the editor) ----------
function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty("APP_KEY");
  if (!key) { key = makeKey_(); props.setProperty("APP_KEY", key); }
  Logger.log("Your app key: " + key);
  Logger.log("Next: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). Then run connectLink.");
  snapshot_(); // checks the sheet can be read
  Logger.log("Sheet read OK.");
}
function newKey() {
  var key = makeKey_();
  PropertiesService.getScriptProperties().setProperty("APP_KEY", key);
  Logger.log("New app key: " + key + "  (reconnect the app with it)");
}
function connectLink() {
  var key = PropertiesService.getScriptProperties().getProperty("APP_KEY");
  var url = WEB_APP_URL || (ScriptApp.getService().getUrl() || "");
  if (!key) throw new Error("Run setup first.");
  if (!/\/exec$/.test(url)) throw new Error("Paste your Web app URL (ending /exec) into WEB_APP_URL at the top, save, and run again.");
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({u: url, k: key}));
  Logger.log("Open this link on your phone (in Chrome):\n" + APP_URL + "#connect=" + payload);
}
function makeKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
}

// ---------- web endpoints ----------
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    checkKey_(p.key);
    if (p.action === "ping") return json_({ok: true});
    return json_({ok: true, data: snapshot_()});
  } catch (err) { return json_({ok: false, error: String(err && err.message || err)}); }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (x) {}
  var lock = LockService.getScriptLock();
  try {
    checkKey_(body.key);
    if (body.action === "snapshot") return json_({ok: true, data: snapshot_()});
    if (body.action === "ping") return json_({ok: true});
    lock.waitLock(20000);
    var result = {};
    if (body.action === "add") result = addExpenses_(body.expenses || []);
    else if (body.action === "delete") result = deleteExpense_(body);
    else if (body.action === "set") result = setCell_(body);
    else throw new Error("Unknown action");
    SpreadsheetApp.flush();
    lock.releaseLock();
    return json_({ok: true, result: result, data: snapshot_()});
  } catch (err) {
    try { lock.releaseLock(); } catch (x) {}
    return json_({ok: false, error: String(err && err.message || err)});
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function checkKey_(k) {
  var key = PropertiesService.getScriptProperties().getProperty("APP_KEY");
  if (!key) throw new Error("Not set up: run setup in Apps Script.");
  if (!k || String(k) !== key) throw new Error("Wrong app key");
}

// ---------- reading ----------
var SHEET_ID = "1D8Ql3fJuhXVXzcdlxs-eAd5e1f6AiaKwVd4hNRb24OM"; // E&S Budgie
var ss_cache_ = null;
function ss_() {
  if (ss_cache_) return ss_cache_;
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (x) {}
  ss_cache_ = active || SpreadsheetApp.openById(SHEET_ID);
  return ss_cache_;
}
function tz_() { return ss_().getSpreadsheetTimeZone() || Session.getScriptTimeZone() || "Europe/London"; }
function cellOut_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), "yyyy-MM-dd");
  return v;
}

function snapshot_() {
  var ss = ss_();
  var tabs = {};
  TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh) tabs[name] = readTab_(sh);
  });
  return {
    updated: new Date().toISOString(),
    timeZone: tz_(),
    tabs: tabs,
    expenses: readLog_(),
    categories: listFromValidation_(LOG_TAB, LOG_FIRST_ROW, 3, ["Food & groceries", "Car fuel", "Entertainment & spending", "Household one-offs"]),
    paidFrom: listFromValidation_(LOG_TAB, LOG_FIRST_ROW, 5, ["Main account", "Bills pot", "Flex pot", "Flex", "Cash"])
  };
}

function readTab_(sh) {
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return {v: [], d: [], e: [], f: {}};
  var rg = sh.getRange(1, 1, lastRow, lastCol);
  var vals = rg.getValues(), disp = rg.getDisplayValues(), forms = rg.getFormulas(), fmts = rg.getNumberFormats();
  var fonts = fontColors_(rg);
  var v = [], d = [], e = [], f = {};
  for (var r = 0; r < lastRow; r++) {
    var vr = [], er = [];
    for (var c = 0; c < lastCol; c++) {
      var raw = vals[r][c];
      vr.push(cellOut_(raw));
      var editable = !forms[r][c] && (fonts[r][c] === BLUE || typeof raw === "boolean") ? 1 : 0;
      er.push(editable);
      if (editable) f[r + "," + c] = fmts[r][c];
    }
    v.push(vr); d.push(disp[r]); e.push(er);
  }
  return {v: v, d: d, e: e, f: f};
}

function fontColors_(rg) {
  try {
    return rg.getFontColorObjects().map(function (row) {
      return row.map(function (c) { try { return c.asRgbColor().asHexString().toLowerCase(); } catch (x) { return ""; } });
    });
  } catch (x) {
    return rg.getFontColors().map(function (row) { return row.map(function (c) { return String(c || "").toLowerCase(); }); });
  }
}

function listFromValidation_(tab, row, col, fallback) {
  try {
    var dv = ss_().getSheetByName(tab).getRange(row, col).getDataValidation();
    if (!dv) return fallback;
    var crit = dv.getCriteriaValues();
    var src = crit && crit[0];
    var out = [];
    if (src && typeof src.getValues === "function") {
      src.getValues().forEach(function (r) { r.forEach(function (x) { if (x !== "" && x !== null) out.push(String(x)); }); });
    } else if (Array.isArray(src)) {
      out = src.map(String);
    }
    return out.length ? out : fallback;
  } catch (x) { return fallback; }
}

function readLog_() {
  var sh = ss_().getSheetByName(LOG_TAB);
  var last = sh.getLastRow();
  if (last < LOG_FIRST_ROW) return [];
  var width = Math.max(9, sh.getLastColumn());
  var vals = sh.getRange(LOG_FIRST_ROW, 1, last - LOG_FIRST_ROW + 1, width).getValues();
  var out = [];
  vals.forEach(function (r, i) {
    if (r[0] === "" || r[0] === null) return;
    out.push({
      row: LOG_FIRST_ROW + i,
      date: cellOut_(r[0]),
      desc: String(r[1] || ""),
      category: String(r[2] || ""),
      amount: Number(r[3]) || 0,
      paidFrom: String(r[4] || ""),
      period: String(r[5] || ""),
      notes: String(r[6] || ""),
      shared: r[7] === true,
      id: String(r[8] || "")
    });
  });
  return out;
}

// ---------- writing ----------
function parseDate_(s) {
  var m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function addExpenses_(list) {
  var sh = ss_().getSheetByName(LOG_TAB);
  if (sh.getMaxColumns() < 9) sh.insertColumnsAfter(sh.getMaxColumns(), 9 - sh.getMaxColumns());
  var last = Math.max(sh.getLastRow(), LOG_FIRST_ROW);
  var existing = sh.getRange(LOG_FIRST_ROW, 1, last - LOG_FIRST_ROW + 1, 9).getValues();
  var ids = {};
  existing.forEach(function (r) { if (r[8]) ids[String(r[8])] = true; });
  var periodFormula = sh.getRange(LOG_FIRST_ROW, 6).getFormulaR1C1();
  var added = 0, skipped = 0;
  var nextFree = 0; // index into existing
  function findFree() {
    while (nextFree < existing.length && existing[nextFree][0] !== "" && existing[nextFree][0] !== null) nextFree++;
    if (nextFree >= existing.length) {
      var lastRow = LOG_FIRST_ROW + existing.length - 1;
      sh.insertRowsAfter(lastRow, 20);
      var src = sh.getRange(lastRow, 1, 1, 9);
      src.copyTo(sh.getRange(lastRow + 1, 1, 20, 9), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      src.copyTo(sh.getRange(lastRow + 1, 1, 20, 9), SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      for (var k = 0; k < 20; k++) existing.push(["", "", "", "", "", "", "", false, ""]);
    }
    return nextFree;
  }
  list.forEach(function (x) {
    var id = String(x.id || "").slice(0, 80);
    if (id && ids[id]) { skipped++; return; }
    var d = parseDate_(x.date) || new Date();
    var amount = Math.round(Number(x.amount) * 100) / 100;
    if (!(amount > 0)) { skipped++; return; }
    var idx = findFree();
    var row = LOG_FIRST_ROW + idx;
    sh.getRange(row, 1, 1, 5).setValues([[d, String(x.desc || "Payment").slice(0, 120), String(x.category || ""), amount, String(x.paidFrom || "Main account")]]);
    sh.getRange(row, 7, 1, 3).setValues([[String(x.notes || "").slice(0, 200), x.shared === true, id]]);
    var pf = sh.getRange(row, 6);
    if (!pf.getFormula() && periodFormula) pf.setFormulaR1C1(periodFormula);
    existing[idx] = [d, x.desc, x.category, amount, x.paidFrom, "", x.notes, x.shared === true, id];
    if (id) ids[id] = true;
    added++;
  });
  return {added: added, skipped: skipped};
}

function deleteExpense_(b) {
  var sh = ss_().getSheetByName(LOG_TAB);
  var rows = readLog_();
  var hit = null;
  if (b.id) hit = rows.filter(function (r) { return r.id === String(b.id); })[0];
  if (!hit && b.row) hit = rows.filter(function (r) { return r.row === Number(b.row) && Math.abs(r.amount - Number(b.amount)) < 0.005 && r.desc === String(b.desc || ""); })[0];
  if (!hit) throw new Error("That payment isn't in the sheet any more. Refresh and try again.");
  sh.getRange(hit.row, 1, 1, 5).clearContent();
  sh.getRange(hit.row, 7, 1, 1).clearContent();
  sh.getRange(hit.row, 8).setValue(false);
  sh.getRange(hit.row, 9).clearContent();
  return {deleted: hit.row};
}

function setCell_(b) {
  if (TABS.indexOf(b.tab) < 0) throw new Error("That tab can't be changed from the app.");
  var sh = ss_().getSheetByName(b.tab);
  var r = Number(b.row) + 1, c = Number(b.col) + 1;
  if (!(r >= 1 && c >= 1)) throw new Error("Bad cell");
  var cell = sh.getRange(r, c);
  var color = fontColors_(cell)[0][0];
  var current = cell.getValue();
  if (cell.getFormula() || !(color === BLUE || typeof current === "boolean")) throw new Error("That cell is worked out by the sheet, so it can't be typed over.");
  var val;
  if (b.type === "number") { val = Number(b.value); if (b.value === "" || b.value === null) val = ""; else if (isNaN(val)) throw new Error("Not a number"); }
  else if (b.type === "date") { val = b.value ? parseDate_(b.value) : ""; if (b.value && !val) throw new Error("Not a date"); }
  else if (b.type === "bool") { val = b.value === true || b.value === "true"; }
  else { val = String(b.value === null || b.value === undefined ? "" : b.value).slice(0, 300); }
  cell.setValue(val);
  return {cell: cell.getA1Notation(), tab: b.tab};
}
