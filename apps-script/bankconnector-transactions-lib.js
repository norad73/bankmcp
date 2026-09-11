// Shared helpers for bank transaction tabs.
// Script version: 0.5.5

function bankConnectorFindColumnMap_(sheet, yellowHeaders, aliases) {
  aliases = aliases || {};
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  Object.keys(yellowHeaders).forEach(function (key) {
    var label = yellowHeaders[key];
    var idx = headers.indexOf(label);
    if (idx < 0 && aliases[key]) idx = headers.indexOf(aliases[key]);
    if (idx >= 0) map[key] = idx + 1;
  });
  return map;
}

function bankConnectorMissingHeaders_(colMap, yellowHeaders) {
  var missing = [];
  Object.keys(yellowHeaders).forEach(function (key) {
    if (!colMap[key]) missing.push(yellowHeaders[key]);
  });
  return missing;
}

function bankConnectorCellHasValue_(value) {
  if (value instanceof Date) return !isNaN(value.getTime());
  return String(value || "").trim() !== "";
}

function bankConnectorRowFilledCount_(row) {
  var filled = 0;
  for (var c = 0; c < row.length; c++) {
    if (bankConnectorCellHasValue_(row[c])) {
      filled++;
      if (filled >= 3) return filled;
    }
  }
  return filled;
}

function bankConnectorFindLastFilledRow_(sheet, minFilled) {
  minFilled = minFilled || 3;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var values = sheetRect_(sheet, 2, 1, lastRow, sheet.getLastColumn()).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (bankConnectorRowFilledCount_(values[i]) >= minFilled) return i + 2;
  }
  return 1;
}

function bankConnectorFindAppendRow_(sheet) {
  return bankConnectorFindLastFilledRow_(sheet, 3) + 1;
}

function bankConnectorLoadKnownIds_(sheet, col) {
  if (!col) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, col, lastRow, col).getValues()
    .map(function (row) { return String(row[0] || "").trim(); })
    .filter(function (id) { return id; });
}

function bankConnectorLoadCompositeKnownIds_(sheet, parts) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var width = sheet.getLastColumn();
  var values = sheetRect_(sheet, 2, 1, lastRow, width).getValues();
  var keys = [];
  values.forEach(function (row) {
    var bits = [];
    for (var i = 0; i < parts.length; i++) {
      var col = parts[i];
      if (!col) return;
      bits.push(String(row[col - 1] || "").trim());
    }
    if (bits.join("|")) keys.push(bits.join("|"));
  });
  return keys;
}

function bankConnectorFindSinceMs_(sheet, dateCol, parser) {
  if (!dateCol) return 0;
  var lastRow = bankConnectorFindLastFilledRow_(sheet, 3);
  if (lastRow < 2) return 0;
  return parser(sheet.getRange(lastRow, dateCol).getValue());
}

function bankConnectorCopyRowFormats_(sheet, templateRow, startRow, count) {
  if (count <= 0 || startRow <= templateRow) return;
  var lastCol = sheet.getLastColumn();
  copyRowFormat_(sheet, templateRow, startRow);
  if (count > 1) {
    sheetRect_(sheet, startRow, 1, startRow, lastCol).copyTo(
      sheetRect_(sheet, startRow + 1, 1, startRow + count - 1, lastCol),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false,
    );
  }
}

function bankConnectorWriteColumn_(sheet, startRow, endRow, col, transactions, pick, numberFormat) {
  if (!col) return;
  var values = transactions.map(function (tx) {
    var value = pick(tx);
    if (value === undefined || value === null || value === "") return [""];
    return [value];
  });
  var range = sheetRect_(sheet, startRow, col, endRow, col);
  range.setValues(values);
  if (numberFormat) range.setNumberFormat(numberFormat);
}

function bankConnectorParseSheetDateMs_(value) {
  if (value instanceof Date) return value.getTime();
  var text = String(value || "").trim();
  if (!text) return 0;
  var m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var parsed = Date.parse(text);
  if (!isNaN(parsed)) return parsed;
  parsed = new Date(text).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function bankConnectorDateToMsDefault_(value) {
  return bankConnectorParseSheetDateMs_(value);
}

function bankConnectorFindUniqueIdColumn_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headers.indexOf("UniqueID");
  return idx >= 0 ? idx + 1 : 1;
}

function bankConnectorUniqueId_(cell1, cell2, cell3, length) {
  if (typeof UNIQUE_ID !== "function") {
    throw new Error("UNIQUE_ID custom function not found in this Apps Script project");
  }
  var amount = cell3;
  if (amount === "" || amount === null || amount === undefined) amount = 0;
  return UNIQUE_ID(cell1, cell2, amount, length || 12);
}

function bankConnectorLoadDateAmountKeys_(sheet, dateCol, amountCol) {
  if (!dateCol || !amountCol) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var dates = sheet.getRange(2, dateCol, lastRow, dateCol).getValues();
  var amounts = sheet.getRange(2, amountCol, lastRow, amountCol).getValues();
  var keys = [];
  for (var i = 0; i < dates.length; i++) {
    var date = dates[i][0];
    var dateText = date instanceof Date
      ? Utilities.formatDate(date, "UTC", "dd/MM/yyyy")
      : String(date || "").trim();
    var amount = amounts[i][0];
    if (!dateText || amount === "" || amount === null || amount === undefined) continue;
    var num = Number(amount);
    if (!isFinite(num)) continue;
    keys.push(dateText + "|" + Math.round(num * 100) / 100);
  }
  return keys;
}

function bankConnectorMakeFillHandlers_(spec) {
  function getSheet_() {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(spec.sheetName);
    if (!sheet) throw new Error('Sheet "' + spec.sheetName + '" not found');
    return sheet;
  }

  function loadKnownIds_(sheet, colMap) {
    if (spec.knownIdField && colMap[spec.knownIdField]) {
      return bankConnectorLoadKnownIds_(sheet, colMap[spec.knownIdField]);
    }
    if (spec.compositeKnownFields && spec.compositeKnownFields.length) {
      return bankConnectorLoadCompositeKnownIds_(
        sheet,
        spec.compositeKnownFields.map(function (key) { return colMap[key]; }),
      );
    }
    return [];
  }

  function fillMenu() {
    log_(spec.logPrefix + " started (menu)");
    try {
      var sheet = getSheet_();
      var colMap = bankConnectorFindColumnMap_(sheet, spec.yellowHeaders, spec.headerAliases);
      var sinceMs = bankConnectorFindSinceMs_(sheet, colMap[spec.sinceDateField], spec.dateToMs || bankConnectorDateToMsDefault_);
      var payload = { sinceMs: sinceMs, knownTransactionIds: loadKnownIds_(sheet, colMap) };
      if (spec.buildPayload) {
        payload = spec.buildPayload(sheet, colMap, payload);
      }
      var result = callBankConnector_(spec.endpoint, payload);
      try { SpreadsheetApp.getUi().alert(spec.formatAlert(result)); } catch (ignore) {}
      return result;
    } catch (err) {
      log_(spec.logPrefix + " failed", { error: String(err.message || err) });
      try { SpreadsheetApp.getUi().alert(String(err.message || err)); } catch (ignore) {}
      throw err;
    }
  }

  function fillImpl(body) {
    body = body || {};
    var transactions = body.transactions || [];
    log_(spec.logPrefix + " impl started", { count: transactions.length, sinceMs: body.sinceMs });
    if (!transactions.length) {
      return { ok: true, action: "skip", reason: spec.skipReason, added: 0 };
    }
    var sheet = getSheet_();
    var colMap = bankConnectorFindColumnMap_(sheet, spec.yellowHeaders, spec.headerAliases);
    var missing = bankConnectorMissingHeaders_(colMap, spec.yellowHeaders);
    if (missing.length) throw new Error(spec.sheetName + ' tab missing yellow headers: ' + missing.join(", "));

    var startRow = bankConnectorFindAppendRow_(sheet);
    var templateRow = startRow > 2 ? startRow - 1 : startRow;
    bankConnectorCopyRowFormats_(sheet, templateRow, startRow, transactions.length);
    spec.writeRows(sheet, startRow, colMap, transactions);
    log_(spec.logPrefix + " impl done", { added: transactions.length, startRow: startRow });
    return {
      ok: true,
      action: "appended",
      added: transactions.length,
      startRow: startRow,
      endRow: startRow + transactions.length - 1,
    };
  }

  function formatAlert(result) {
    if (result.action === "skip") return spec.label + ": skipped (" + (result.reason || "no new transactions") + ")";
    if (result.added) return spec.label + ": added " + result.added + " transaction(s) on rows " + result.startRow + "-" + result.endRow;
    return spec.label + ": done";
  }

  spec.formatAlert = formatAlert;
  registerBankConnectorModule_({
    sheetName: spec.sheetName,
    menuLabel: spec.menuLabel,
    menuHandler: spec.menuHandler,
    action: spec.action,
    impl: fillImpl,
  });

  return { fillMenu: fillMenu, fillImpl: fillImpl };
}
