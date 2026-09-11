// BankConnector — append new rows on the "Airwallex USD" transactions tab.
// Script version: 0.4.39 (keep in sync with BankConnector app version)
// Requires UNIQUE_ID(datetime, description, amount, length) in the same Apps Script project.
// Paste with bankconnector-shared.gs and bankconnector-balances.gs in the same Apps Script project.

var AIRWALLEX_USD_SHEET_NAME = "Airwallex USD";

var AIRWALLEX_USD_YELLOW_HEADERS = {
  time: "Time",
  type: "Type",
  financialTransactionType: "Financial Transaction Type",
  transactionId: "Transaction Id",
  description: "Description",
  walletCurrency: "Wallet Currency",
  targetCurrency: "Target Currency",
  targetAmount: "Target Amount",
  conversionRate: "Conversion Rate",
  matureDate: "Mature Date",
  amount: "Amount",
  fee: "Fee",
  debitNetAmount: "Debit Net Amount",
  creditNetAmount: "Credit Net Amount",
  availableBalance: "Available Balance",
  accountBalance: "Account Balance",
  createdAt: "Created At",
  requestId: "Request Id",
  reference: "Reference",
  noteToSelf: "Note to Self",
};

function fillAirwallexUsdTransactions() {
  log_("fillAirwallexUsdTransactions started (menu)");
  try {
    var sheet = getAirwallexUsdSheet_();
    var sinceMs = findAirwallexUsdSinceMs_(sheet);
    var knownTransactionIds = loadAirwallexUsdTransactionIds_(sheet);
    var anchorAccountBalance = loadAirwallexUsdAnchorAccountBalance_(sheet);
    var payload = { sinceMs: sinceMs, knownTransactionIds: knownTransactionIds };
    if (anchorAccountBalance !== undefined) payload.anchorAccountBalance = anchorAccountBalance;
    var result = callBankConnector_("/cron/sync-airwallex-usd-transactions", payload);
    try {
      SpreadsheetApp.getUi().alert(formatAirwallexUsdAlert_(result));
    } catch (ignore) {}
    return result;
  } catch (err) {
    log_("fillAirwallexUsdTransactions failed", { error: String(err.message || err) });
    try { SpreadsheetApp.getUi().alert(String(err.message || err)); } catch (ignore) {}
    throw err;
  }
}

function fillAirwallexUsdTransactionsImpl_(body) {
  body = body || {};
  var transactions = body.transactions || [];
  log_("fillAirwallexUsdTransactionsImpl started", { count: transactions.length, sinceMs: body.sinceMs });
  if (!transactions.length) {
    return { ok: true, action: "skip", reason: "No new Airwallex USD transactions", added: 0 };
  }

  var sheet = getAirwallexUsdSheet_();
  var colMap = findAirwallexUsdColumnMap_(sheet);
  var missing = airwallexUsdMissingHeaders_(colMap);
  if (missing.length) throw new Error("Airwallex USD tab missing yellow headers: " + missing.join(", "));

  var startRow = findAirwallexUsdAppendRow_(sheet);
  var templateRow = startRow > 2 ? startRow - 1 : startRow;
  var added = transactions.length;

  copyAirwallexUsdRowFormats_(sheet, templateRow, startRow, added);
  writeAirwallexUsdRows_(sheet, startRow, colMap, transactions);

  log_("fillAirwallexUsdTransactionsImpl done", { added: added, startRow: startRow });
  return { ok: true, action: "appended", added: added, startRow: startRow, endRow: startRow + added - 1 };
}

function formatAirwallexUsdAlert_(result) {
  if (result.action === "skip") return "Airwallex USD: skipped (" + (result.reason || "no new transactions") + ")";
  if (result.added) return "Airwallex USD: added " + result.added + " transaction(s) on rows " + result.startRow + "-" + result.endRow;
  return "Airwallex USD: done";
}

function getAirwallexUsdSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AIRWALLEX_USD_SHEET_NAME);
  if (!sheet) throw new Error('Sheet "Airwallex USD" not found');
  return sheet;
}

function findAirwallexUsdColumnMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  Object.keys(AIRWALLEX_USD_YELLOW_HEADERS).forEach(function (key) {
    var label = AIRWALLEX_USD_YELLOW_HEADERS[key];
    var idx = headers.indexOf(label);
    if (idx >= 0) map[key] = idx + 1;
  });
  return map;
}

function airwallexUsdMissingHeaders_(colMap) {
  var missing = [];
  Object.keys(AIRWALLEX_USD_YELLOW_HEADERS).forEach(function (key) {
    if (!colMap[key]) missing.push(AIRWALLEX_USD_YELLOW_HEADERS[key]);
  });
  return missing;
}

function airwallexUsdCellHasValue_(value) {
  if (value instanceof Date) return !isNaN(value.getTime());
  return String(value || "").trim() !== "";
}

function airwallexUsdRowFilledCount_(row) {
  var filled = 0;
  for (var c = 0; c < row.length; c++) {
    if (airwallexUsdCellHasValue_(row[c])) {
      filled++;
      if (filled >= 3) return filled;
    }
  }
  return filled;
}

function findLastAirwallexUsdFilledRow_(sheet, minFilled) {
  minFilled = minFilled || 3;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var lastCol = sheet.getLastColumn();
  var values = sheetRect_(sheet, 2, 1, lastRow, lastCol).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (airwallexUsdRowFilledCount_(values[i]) >= minFilled) return i + 2;
  }
  return 1;
}

function findAirwallexUsdAppendRow_(sheet) {
  return findLastAirwallexUsdFilledRow_(sheet, 3) + 1;
}

function loadAirwallexUsdAnchorAccountBalance_(sheet) {
  var colMap = findAirwallexUsdColumnMap_(sheet);
  if (!colMap.accountBalance) return undefined;
  var lastRow = findLastAirwallexUsdFilledRow_(sheet, 3);
  if (lastRow < 2) return undefined;
  var value = sheet.getRange(lastRow, colMap.accountBalance).getValue();
  if (value === "" || value === null) return undefined;
  var n = Number(value);
  return isNaN(n) ? undefined : n;
}

function loadAirwallexUsdTransactionIds_(sheet) {
  var colMap = findAirwallexUsdColumnMap_(sheet);
  if (!colMap.transactionId) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, colMap.transactionId, lastRow, colMap.transactionId).getValues();
  return values
    .map(function (row) { return String(row[0] || "").trim(); })
    .filter(function (id) { return id; });
}

function findAirwallexUsdSinceMs_(sheet) {
  var colMap = findAirwallexUsdColumnMap_(sheet);
  if (!colMap.time) return 0;
  var lastRow = findLastAirwallexUsdFilledRow_(sheet, 3);
  if (lastRow < 2) return 0;
  var value = sheet.getRange(lastRow, colMap.time).getValue();
  return airwallexUsdDateToMs_(value);
}

function airwallexUsdDateToMs_(value) {
  if (value instanceof Date) return value.getTime();
  var text = String(value || "").trim();
  if (!text) return 0;
  var parsed = Date.parse(text);
  if (!isNaN(parsed)) return parsed;
  parsed = new Date(text).getTime();
  if (!isNaN(parsed)) return parsed;
  return 0;
}

function copyAirwallexUsdRowFormats_(sheet, templateRow, startRow, count) {
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

function writeAirwallexUsdRows_(sheet, startRow, colMap, transactions) {
  var endRow = startRow + transactions.length - 1;
  var uniqueIdCol = findAirwallexUsdUniqueIdColumn_(sheet);
  writeAirwallexUsdColumn_(sheet, startRow, endRow, uniqueIdCol, transactions, function (tx) {
    return airwallexUsdUniqueId_(tx);
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.time, transactions, function (tx) {
    return airwallexUsdSheetTime_(tx.time);
  }, "@");
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.type, transactions, function (tx) {
    return tx.type;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.financialTransactionType, transactions, function (tx) {
    return tx.financialTransactionType;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.transactionId, transactions, function (tx) {
    return tx.transactionId;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.description, transactions, function (tx) {
    return tx.description;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.walletCurrency, transactions, function (tx) {
    return tx.walletCurrency;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.targetCurrency, transactions, function (tx) {
    return tx.targetCurrency;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.targetAmount, transactions, function (tx) {
    return tx.targetAmount;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.conversionRate, transactions, function (tx) {
    return tx.conversionRate;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.matureDate, transactions, function (tx) {
    return tx.matureDate;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.amount, transactions, function (tx) {
    return tx.amount;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.fee, transactions, function (tx) {
    return tx.fee;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.debitNetAmount, transactions, function (tx) {
    return tx.debitNetAmount;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.creditNetAmount, transactions, function (tx) {
    return tx.creditNetAmount;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.availableBalance, transactions, function (tx) {
    return tx.availableBalance;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.accountBalance, transactions, function (tx) {
    return tx.accountBalance;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.createdAt, transactions, function (tx) {
    return airwallexUsdSheetTime_(tx.createdAt);
  }, "@");
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.requestId, transactions, function (tx) {
    return tx.requestId;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.reference, transactions, function (tx) {
    return tx.reference;
  });
  writeAirwallexUsdColumn_(sheet, startRow, endRow, colMap.noteToSelf, transactions, function (tx) {
    return tx.noteToSelf;
  });
}

function writeAirwallexUsdColumn_(sheet, startRow, endRow, col, transactions, pick, numberFormat) {
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

function findAirwallexUsdUniqueIdColumn_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headers.indexOf("UniqueID");
  return idx >= 0 ? idx + 1 : 1;
}

function airwallexUsdUniqueId_(tx) {
  if (typeof UNIQUE_ID !== "function") {
    throw new Error("UNIQUE_ID custom function not found in this Apps Script project");
  }
  var amount = tx.amount;
  if (amount === "" || amount === null || amount === undefined) amount = 0;
  return UNIQUE_ID(tx.time, tx.description, amount, 12);
}

function airwallexUsdSheetTime_(iso) {
  // Keep BAR timestamps as text (e.g. 2026-08-25T18:15:17-0700), not Sheet date cells.
  return String(iso || "").trim();
}
