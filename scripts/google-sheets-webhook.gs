// BankConnector — fill the "Balances" tab from live bank data.
//
// Setup:
// 1. Extensions → Apps Script — paste this file into the spreadsheet-bound project.
// 2. Script properties (Project settings → Script properties):
//      BANKCONNECTOR_URL = https://bankconnector.onrender.com
//      CRON_SECRET       = (same value as on Render)
// 3. Run once: setupFillButtonMenu (or reload the sheet — onOpen adds the menu).
// 4. Optional: Insert → Button → assign function fillBalancesSheet, label "Fill balances sheet".
// 5. Deploy → New deployment → Web app (Execute as: Me, Anyone) for cron POST { "action": "fill" }.

const SHEET_NAME = "Balances";

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

const VALUE_COLS = [
  COL.mercury, COL.stripe, COL.airwallexUsd, COL.airwallexEur, COL.wiseUsd, COL.wiseEur,
  COL.paypal, COL.eurobank, COL.viva, COL.revolutEur, COL.revolutUsd, COL.eurobankIke, COL.inTransit,
];

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
  return json({ ok: true, service: "BankConnector", action: "Use POST { action: 'fill' } or run fillBalancesSheet from the sheet." });
}

function doPost(e) {
  const body = e && e.postData ? JSON.parse(e.postData.contents) : {};
  if (body.action === "fill") {
    const result = fillBalancesSheetImpl_();
    return json(result);
  }
  return json({ ok: false, error: "Unknown action. Use { action: 'fill' }." });
}

function fillBalancesSheet() {
  try {
    const result = fillBalancesSheetImpl_();
    try {
      const msg = result.action === "skip"
        ? "Skipped: " + (result.reason || "already filled")
        : "Filled row " + result.row + " (" + result.date + ")";
      SpreadsheetApp.getUi().alert(msg);
    } catch (ignore) {}
    return result;
  } catch (err) {
    try { SpreadsheetApp.getUi().alert(String(err.message || err)); } catch (ignore) {}
    throw err;
  }
}

function fillBalancesSheetImpl_() {
  const sheet = getBalancesSheet_();
  const today = athensDateString_();
  const target = resolveTargetRow_(sheet, today);

  if (target.action === "skip") {
    return { ok: true, action: "skip", reason: target.reason || "Today already filled", row: target.row, date: today };
  }

  const payload = fetchSheetBalances_();
  if (!payload.ok) throw new Error(payload.error || "BankConnector request failed");

  if (target.setDate) {
    copyRowFormat_(sheet, target.templateRow, target.row);
    sheet.getRange(target.row, COL.date).setValue(today);
  }

  writeBalanceValues_(sheet, target.row, payload.columns);
  copyTotalFormula_(sheet, target.templateRow, target.row);

  return {
    ok: true,
    action: target.setDate ? "appended" : "updated",
    row: target.row,
    date: today,
    columns: payload.columns,
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

function findLastDateRow_(sheet) {
  const values = sheet.getRange(1, COL.date, sheet.getLastRow(), 1).getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (toIsoDate_(values[i][0])) return i + 1;
  }
  return 1;
}

function rowIsFilled_(sheet, row) {
  const values = sheet.getRange(row, COL.stripe, row, COL.eurobankIke).getValues()[0];
  return values.some(function (v) { return v !== "" && v !== null && v !== 0; });
}

function resolveTargetRow_(sheet, today) {
  const lastRow = findLastDateRow_(sheet);
  const lastDate = toIsoDate_(sheet.getRange(lastRow, COL.date).getValue());

  if (lastDate === today) {
    if (rowIsFilled_(sheet, lastRow)) {
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

function fetchSheetBalances_() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty("BANKCONNECTOR_URL") || "").replace(/\/$/, "");
  const secret = props.getProperty("CRON_SECRET") || "";
  if (!base || !secret) {
    throw new Error("Set Script properties BANKCONNECTOR_URL and CRON_SECRET");
  }

  const res = UrlFetchApp.fetch(base + "/cron/sheet-balances", {
    method: "get",
    headers: { Authorization: "Bearer " + secret },
    muteHttpExceptions: true,
  });
  const text = res.getContentText();
  const data = JSON.parse(text);
  if (res.getResponseCode() >= 400) {
    return { ok: false, error: data.error || text.slice(0, 200) };
  }
  return { ok: true, columns: data.columns || {}, date: data.date, fxDate: data.fxDate };
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
