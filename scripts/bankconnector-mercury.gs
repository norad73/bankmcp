// BankConnector — append new rows on the "Mercury" transactions tab.
// Script version: 0.4.23 (keep in sync with BankConnector app version)
// Paste with bankconnector-shared.gs and bankconnector-balances.gs in the same Apps Script project.

var MERCURY_SHEET_NAME = "Mercury";

var MERCURY_YELLOW_HEADERS = {
  dateUtc: "Date (UTC)",
  description: "Description",
  amount: "Amount",
  status: "Status",
  sourceAccount: "Source Account",
  bankDescription: "Bank Description",
  reference: "Reference",
  note: "Note",
  nameOnCard: "Name On Card",
  category: "Category",
  glCode: "GL Code",
};

function fillMercuryTransactions() {
  log_("fillMercuryTransactions started (menu)");
  try {
    var sheet = getMercurySheet_();
    var sinceMs = findMercurySinceMs_(sheet);
    var result = callBankConnector_("/cron/sync-mercury-transactions", { sinceMs: sinceMs });
    try {
      SpreadsheetApp.getUi().alert(formatMercuryAlert_(result));
    } catch (ignore) {}
    return result;
  } catch (err) {
    log_("fillMercuryTransactions failed", { error: String(err.message || err) });
    try { SpreadsheetApp.getUi().alert(String(err.message || err)); } catch (ignore) {}
    throw err;
  }
}

function fillMercuryTransactionsImpl_(body) {
  body = body || {};
  var transactions = body.transactions || [];
  log_("fillMercuryTransactionsImpl started", { count: transactions.length, sinceMs: body.sinceMs });
  if (!transactions.length) {
    return { ok: true, action: "skip", reason: "No new Mercury transactions", added: 0 };
  }

  var sheet = getMercurySheet_();
  var colMap = findMercuryColumnMap_(sheet);
  var missing = mercuryMissingHeaders_(colMap);
  if (missing.length) throw new Error("Mercury tab missing yellow headers: " + missing.join(", "));

  var startRow = findLastMercuryDataRow_(sheet, colMap.description) + 1;
  var templateRow = startRow > 2 ? startRow - 1 : startRow;
  var added = 0;

  transactions.forEach(function (tx, index) {
    var row = startRow + index;
    if (index > 0 || row > templateRow) copyRowFormat_(sheet, templateRow, row);
    writeMercuryRow_(sheet, row, colMap, tx);
    added++;
  });

  log_("fillMercuryTransactionsImpl done", { added: added, startRow: startRow });
  return { ok: true, action: "appended", added: added, startRow: startRow, endRow: startRow + added - 1 };
}

function formatMercuryAlert_(result) {
  if (result.action === "skip") return "Mercury: skipped (" + (result.reason || "no new transactions") + ")";
  if (result.added) return "Mercury: added " + result.added + " transaction(s) on rows " + result.startRow + "-" + result.endRow;
  return "Mercury: done";
}

function getMercurySheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MERCURY_SHEET_NAME);
  if (!sheet) throw new Error('Sheet "Mercury" not found');
  return sheet;
}

function findMercuryColumnMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  Object.keys(MERCURY_YELLOW_HEADERS).forEach(function (key) {
    var label = MERCURY_YELLOW_HEADERS[key];
    var idx = headers.indexOf(label);
    if (idx < 0 && key === "dateUtc") idx = headers.indexOf("Date");
    if (idx >= 0) map[key] = idx + 1;
  });
  return map;
}

function mercuryMissingHeaders_(colMap) {
  var missing = [];
  Object.keys(MERCURY_YELLOW_HEADERS).forEach(function (key) {
    if (!colMap[key]) missing.push(MERCURY_YELLOW_HEADERS[key]);
  });
  return missing;
}

function findLastMercuryDataRow_(sheet, descriptionCol) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var values = sheet.getRange(2, descriptionCol, lastRow, descriptionCol).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || "").trim()) return i + 2;
  }
  return 1;
}

function findMercurySinceMs_(sheet) {
  var colMap = findMercuryColumnMap_(sheet);
  if (!colMap.dateUtc) return 0;
  var lastRow = findLastMercuryDataRow_(sheet, colMap.description || colMap.dateUtc);
  if (lastRow < 2) return 0;
  var value = sheet.getRange(lastRow, colMap.dateUtc).getValue();
  return mercuryDateToMs_(value);
}

function mercuryDateToMs_(value) {
  if (value instanceof Date) return value.getTime();
  var text = String(value || "").trim();
  if (!text) return 0;
  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return parsed.getTime();
  return 0;
}

function writeMercuryRow_(sheet, row, colMap, tx) {
  setMercuryCell_(sheet, row, colMap.dateUtc, mercurySheetDate_(tx.dateUtc));
  setMercuryCell_(sheet, row, colMap.description, tx.description);
  setMercuryCell_(sheet, row, colMap.amount, tx.amount);
  setMercuryCell_(sheet, row, colMap.status, tx.status);
  setMercuryCell_(sheet, row, colMap.sourceAccount, tx.sourceAccount);
  setMercuryCell_(sheet, row, colMap.bankDescription, tx.bankDescription);
  setMercuryCell_(sheet, row, colMap.reference, tx.reference);
  setMercuryCell_(sheet, row, colMap.note, tx.note);
  setMercuryCell_(sheet, row, colMap.nameOnCard, tx.nameOnCard);
  setMercuryCell_(sheet, row, colMap.category, tx.category);
  setMercuryCell_(sheet, row, colMap.glCode, tx.glCode);
}

function mercurySheetDate_(iso) {
  var ms = Date.parse(String(iso || ""));
  if (!isNaN(ms)) return new Date(ms);
  return String(iso || "");
}

function setMercuryCell_(sheet, row, col, value) {
  if (!col) return;
  if (value === undefined || value === null || value === "") return;
  sheet.getRange(row, col).setValue(value);
}
