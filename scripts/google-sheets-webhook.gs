// BankConnector — fill the "Balances" and "CC" tabs from live bank data.
// Script version: 0.4.17 (keep in sync with BankConnector app version)
//
// Setup:
// 1. Extensions → Apps Script — paste this file into the spreadsheet-bound project.
// 2. Script properties (Project settings → Script properties):
//      BANKCONNECTOR_URL = https://bankconnector.onrender.com
//      CRON_SECRET       = (same value as on Render)
// 3. Reload the sheet — onOpen adds BankConnector menu.
// 4. Deploy → Web app (Execute as: Me, Anyone) — same URL in Render GOOGLE_SHEETS_WEBHOOK_URL.

const SHEET_NAME = "Balances";
const CC_SHEET_NAME = "CC";

const COL = {
  date: 1,
  mercury: 3,
  stripe: 4,
  airwallexUsd: 5,
  airwallexEur: 6,
  wiseUsd: 7,
  wiseEur: 8,
  paypal: 10,
  eurobank: 11,
  viva: 12,
  revolutEur: 13,
  revolutUsd: 14,
  eurobankIke: 15,
  inTransit: 16,
  total: 18,
};

const CC_COL = { date: 1, close: 2 };

function onOpen() {
  setupFillButtonMenu();
}

function setupFillButtonMenu() {
  SpreadsheetApp.getUi()
    .createMenu("BankConnector")
    .addItem("Fill balances sheet", "fillBalancesSheet")
    .addToUi();
}

function doGet() {
  return json({ ok: true, service: "BankConnector", action: "Use POST { action: 'fill', columns: {...}, eurUsdClose: ... } or run fillBalancesSheet from the sheet." });
}

function doPost(e) {
  const body = e && e.postData ? JSON.parse(e.postData.contents) : {};
  if (body.action === "fill") {
    const result = fillSheetsImpl_(body);
    return json(result);
  }
  return json({ ok: false, error: "Unknown action. Use { action: 'fill' }." });
}

/** Menu / button — ask BankConnector to fetch balances and POST them back here. */
function fillBalancesSheet() {
  try {
    const result = triggerBankConnectorFill_();
    try {
      const msg = formatFillAlert_(result);
      SpreadsheetApp.getUi().alert(msg);
    } catch (ignore) {}
    return result;
  } catch (err) {
    try { SpreadsheetApp.getUi().alert(String(err.message || err)); } catch (ignore) {}
    throw err;
  }
}

function formatFillAlert_(result) {
  const parts = [];
  if (result.action === "skip") parts.push("Balances: skipped (" + (result.reason || "already filled") + ")");
  else parts.push("Balances: filled row " + result.row + " (" + result.date + ")");
  if (result.cc) {
    if (result.cc.action === "skip") parts.push("CC: skipped (" + (result.cc.reason || "already filled") + ")");
    else parts.push("CC: filled row " + result.cc.row + " (" + result.cc.date + ", " + result.cc.close + ")");
  }
  return parts.join("\n");
}

function triggerBankConnectorFill_() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty("BANKCONNECTOR_URL") || "").trim().replace(/\/$/, "");
  const secret = (props.getProperty("CRON_SECRET") || "").trim();
  if (!base || !/^https:\/\//.test(base)) {
    throw new Error("Set Script property BANKCONNECTOR_URL to https://bankconnector.onrender.com");
  }
  if (!secret) throw new Error("Set Script property CRON_SECRET (from Render environment)");

  const res = UrlFetchApp.fetch(base + "/cron/sync-balances", {
    method: "post",
    headers: { Authorization: "Bearer " + secret },
    muteHttpExceptions: true,
  });
  return parseBankConnectorResponse_(res.getContentText(), res.getResponseCode());
}

function parseBankConnectorResponse_(text, code) {
  try {
    const data = JSON.parse(text);
    if (code >= 400) throw new Error(data.error || text.slice(0, 200));
    if (data.action) return data;
    if (data.ok === false) throw new Error(data.error || "BankConnector fill failed");
    return data;
  } catch (err) {
    if (err.message && err.message.indexOf("BankConnector") === 0) throw err;
    if (err.message && err.message.indexOf("Set Script") === 0) throw err;
    throw new Error(
      "BankConnector returned non-JSON (HTTP " + code + "). "
      + "Check BANKCONNECTOR_URL and CRON_SECRET in Script properties. "
      + "Response starts with: " + String(text).slice(0, 80),
    );
  }
}

function fillSheetsImpl_(body) {
  body = body || {};
  const cc = fillCcSheetImpl_(body);
  const balances = fillBalancesSheetImpl_(body);
  return Object.assign({}, balances, { cc: cc });
}

function fillBalancesSheetImpl_(body) {
  const sheet = getBalancesSheet_();
  const today = body.date || athensDateString_();
  const target = resolveTargetRow_(sheet, today, COL.date, function (row) {
    const values = sheet.getRange(row, COL.stripe, row, COL.eurobankIke).getValues()[0];
    return values.some(function (v) { return v !== "" && v !== null && v !== 0; });
  });

  if (target.action === "skip") {
    return { ok: true, action: "skip", reason: target.reason || "Today already filled", row: target.row, date: today };
  }

  const columns = body.columns;
  if (!columns) throw new Error("Missing columns in fill request");

  if (target.setDate) {
    copyRowFormat_(sheet, target.templateRow, target.row);
    sheet.getRange(target.row, COL.date).setValue(today);
  }

  writeBalanceValues_(sheet, target.row, columns);
  copyTotalFormula_(sheet, target.templateRow, target.row);

  return {
    ok: true,
    action: target.setDate ? "appended" : "updated",
    row: target.row,
    date: today,
    columns: columns,
  };
}

function fillCcSheetImpl_(body) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CC_SHEET_NAME);
  if (!sheet) return { ok: true, action: "skip", reason: "CC sheet not found" };

  const rateDate = body.fxDate || body.date || athensDateString_();
  const close = body.eurUsdClose;
  if (close === undefined || close === null) {
    return { ok: true, action: "skip", reason: "No EUR/USD rate in fill request" };
  }

  const target = resolveTargetRow_(sheet, rateDate, CC_COL.date, function (row) {
    const value = sheet.getRange(row, CC_COL.close).getValue();
    return value !== "" && value !== null && value !== 0;
  });

  if (target.action === "skip") {
    return { ok: true, action: "skip", reason: target.reason || "Already filled", row: target.row, date: rateDate, close: close };
  }

  if (target.setDate) {
    copyRowFormat_(sheet, target.templateRow, target.row);
    sheet.getRange(target.row, CC_COL.date).setValue(rateDate);
  }

  sheet.getRange(target.row, CC_COL.close).setValue(close);

  return {
    ok: true,
    action: target.setDate ? "appended" : "updated",
    row: target.row,
    date: rateDate,
    close: close,
  };
}

function getBalancesSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "Balances" not found');
  return sheet;
}

function athensDateString_() {
  return Utilities.formatDate(new Date(), "Europe/Athens", "yyyy-MM-dd");
}

function toIsoDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, "Europe/Athens", "yyyy-MM-dd");
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, "Europe/Athens", "yyyy-MM-dd");
  return text;
}

function findLastDateRow_(sheet, dateCol) {
  const values = sheet.getRange(1, dateCol, sheet.getLastRow(), dateCol).getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (toIsoDate_(values[i][0])) return i + 1;
  }
  return 1;
}

function resolveTargetRow_(sheet, today, dateCol, rowIsFilledFn) {
  const lastRow = findLastDateRow_(sheet, dateCol);
  const lastDate = toIsoDate_(sheet.getRange(lastRow, dateCol).getValue());

  if (lastDate === today) {
    if (rowIsFilledFn(lastRow)) {
      return { action: "skip", row: lastRow, reason: "Today already filled" };
    }
    return { action: "fill", row: lastRow, setDate: false, templateRow: lastRow > 2 ? lastRow - 1 : lastRow };
  }

  if (!lastDate || lastDate < today) {
    const newRow = lastRow + 1;
    return { action: "fill", row: newRow, setDate: true, templateRow: lastRow };
  }

  return { action: "skip", row: lastRow, reason: "Last date is in the future: " + lastDate };
}

function writeBalanceValues_(sheet, row, columns) {
  const map = {
    [COL.stripe]: columns.stripe,
    [COL.airwallexUsd]: columns.airwallexUsd,
    [COL.airwallexEur]: columns.airwallexEur,
    [COL.wiseUsd]: columns.wiseUsd,
    [COL.wiseEur]: columns.wiseEur,
    [COL.paypal]: columns.paypal,
    [COL.eurobank]: columns.eurobank,
    [COL.viva]: columns.viva,
    [COL.eurobankIke]: columns.eurobankIke,
  };
  Object.keys(map).forEach(function (col) {
    const value = map[col];
    if (value !== undefined && value !== null) {
      sheet.getRange(row, Number(col)).setValue(value);
    }
  });
}

function copyRowFormat_(sheet, fromRow, toRow) {
  const lastCol = sheet.getLastColumn();
  sheet.getRange(fromRow, 1, fromRow, lastCol).copyTo(
    sheet.getRange(toRow, 1, toRow, lastCol),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false,
  );
}

function copyTotalFormula_(sheet, templateRow, row) {
  const formula = sheet.getRange(templateRow, COL.total).getFormula();
  if (formula) {
    sheet.getRange(row, COL.total).setFormula(formula.replace(new RegExp(templateRow, "g"), String(row)));
    return;
  }
  sheet.getRange(row, COL.total).setFormula("=SUM(C" + row + ":Q" + row + ")");
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
