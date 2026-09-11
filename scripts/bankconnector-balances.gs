// BankConnector — fill the "Balances" and "CC" tabs from live bank data.
// Script version: 0.4.39 (keep in sync with BankConnector app version)
//
// Setup: paste ALL bankconnector-*.gs files from scripts/ into the spreadsheet Apps Script project:
//   bankconnector-shared.gs, bankconnector-balances.gs, bankconnector-mercury.gs,
//   bankconnector-airwallex-usd.gs, bankconnector-airwallex-eur.gs
// Then deploy a new version of the existing web app (same URL).

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

// Call this from your own onOpen() — only one onOpen() is allowed per project.
function installBankConnectorMenu_() {
  SpreadsheetApp.getUi()
    .createMenu("BankConnector")
    .addItem("Fill balances sheet", "fillBalancesSheet")
    .addItem("Fill Mercury transactions", "fillMercuryTransactions")
    .addItem("Fill Airwallex USD transactions", "fillAirwallexUsdTransactions")
    .addItem("Fill Airwallex EUR transactions", "fillAirwallexEurTransactions")
    .addToUi();
}

function doGet() {
  return json({
    ok: true,
    service: "BankConnector",
    action: "Use POST { action: 'fill' | 'fill-mercury' | 'fill-airwallex-usd' | 'fill-airwallex-eur', ... } or run menu items from the sheet.",
  });
}

function doPost(e) {
  log_("doPost started");
  try {
    const body = e && e.postData ? JSON.parse(e.postData.contents) : {};
    log_("doPost body", { action: body.action, source: body.source, count: (body.transactions || []).length });
    if (body.action === "fill") {
      const result = fillSheetsImpl_(body);
      log_("doPost done", { action: result.action, row: result.row, cc: result.cc });
      return json(result);
    }
    if (body.action === "fill-mercury") {
      const result = fillMercuryTransactionsImpl_(body);
      log_("doPost done", result);
      return json(result);
    }
    if (body.action === "fill-airwallex-usd") {
      const result = fillAirwallexUsdTransactionsImpl_(body);
      log_("doPost done", result);
      return json(result);
    }
    if (body.action === "fill-airwallex-eur") {
      const result = fillAirwallexEurTransactionsImpl_(body);
      log_("doPost done", result);
      return json(result);
    }
    log_("doPost unknown action", body.action);
    return json({ ok: false, error: "Unknown action. Use { action: 'fill' }, { action: 'fill-mercury' }, { action: 'fill-airwallex-usd' }, or { action: 'fill-airwallex-eur' }." });
  } catch (err) {
    log_("doPost failed", { error: String(err.message || err) });
    return json({ ok: false, error: String(err.message || err) });
  }
}

function fillBalancesSheet() {
  log_("fillBalancesSheet started (menu)");
  try {
    const result = callBankConnector_("/cron/sync-balances");
    log_("fillBalancesSheet done", { action: result.action, row: result.row, cc: result.cc });
    try {
      SpreadsheetApp.getUi().alert(formatFillAlert_(result));
    } catch (ignore) {}
    return result;
  } catch (err) {
    log_("fillBalancesSheet failed", { error: String(err.message || err) });
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

function fillSheetsImpl_(body) {
  body = body || {};
  log_("fillSheetsImpl started", { date: body.date, fxDate: body.fxDate });
  const cc = fillCcSheetImpl_(body);
  const balances = fillBalancesSheetImpl_(body);
  const result = Object.assign({}, balances, { cc: cc });
  log_("fillSheetsImpl done", { balances: { action: balances.action, row: balances.row }, cc: cc });
  return result;
}

function fillBalancesSheetImpl_(body) {
  const sheet = getBalancesSheet_();
  const today = body.date || athensDateString_();
  const target = resolveTargetRow_(sheet, today, COL.date, function (row) {
    const values = sheet.getRange(row, COL.stripe, row, COL.eurobankIke).getValues()[0];
    return values.some(function (v) { return v !== "" && v !== null && v !== 0; });
  });

  log_("Balances target row", target);

  if (target.action === "skip") {
    log_("Balances skipped", { reason: target.reason, row: target.row });
    return { ok: true, action: "skip", reason: target.reason || "Today already filled", row: target.row, date: today };
  }

  const columns = body.columns;
  if (!columns) throw new Error("Missing columns in fill request");
  log_("Balances writing columns", columns);

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

  log_("CC target row", target);

  if (target.action === "skip") {
    log_("CC skipped", { reason: target.reason, row: target.row });
    return { ok: true, action: "skip", reason: target.reason || "Already filled", row: target.row, date: rateDate, close: close };
  }

  log_("CC writing close", { row: target.row, date: rateDate, close: close });

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
    [COL.mercury]: columns.mercury,
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

function copyTotalFormula_(sheet, templateRow, row) {
  const formula = sheet.getRange(templateRow, COL.total).getFormula();
  if (formula) {
    sheet.getRange(row, COL.total).setFormula(formula.replace(new RegExp(templateRow, "g"), String(row)));
    return;
  }
  sheet.getRange(row, COL.total).setFormula("=SUM(C" + row + ":Q" + row + ")");
}
