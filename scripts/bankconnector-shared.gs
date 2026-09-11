// BankConnector — shared helpers for Google Sheets scripts.
// Script version: 0.4.40 (keep in sync with BankConnector app version)

function log_(message, detail) {
  var line = detail !== undefined ? message + " " + JSON.stringify(detail) : message;
  console.log("[BankConnector] " + line);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function bankConnectorProps_() {
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty("BANKCONNECTOR_URL") || "").trim().replace(/\/$/, "");
  var secret = (props.getProperty("CRON_SECRET") || "").trim();
  if (!base || !/^https:\/\//.test(base)) {
    throw new Error("Set Script property BANKCONNECTOR_URL to https://bankconnector.onrender.com");
  }
  if (!secret) throw new Error("Set Script property CRON_SECRET (from Render environment)");
  return { base: base, secret: secret };
}

function parseBankConnectorResponse_(text, code) {
  var data;
  try {
    data = JSON.parse(text);
  } catch (parseErr) {
    throw new Error(
      "BankConnector returned non-JSON (HTTP " + code + "). "
      + "Check BANKCONNECTOR_URL and CRON_SECRET in Script properties. "
      + "Response starts with: " + String(text).slice(0, 80),
    );
  }
  if (code >= 400) throw new Error(data.error || text.slice(0, 200));
  if (data.action) return data;
  if (data.ok === false) throw new Error(data.error || "BankConnector request failed");
  return data;
}

function callBankConnector_(path, payload) {
  var cfg = bankConnectorProps_();
  var url = cfg.base + path;
  log_("calling BankConnector", { url: url, path: path });
  var options = {
    method: "post",
    headers: { Authorization: "Bearer " + cfg.secret },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  log_("BankConnector response", { http: code, bytes: res.getContentText().length });
  return parseBankConnectorResponse_(res.getContentText(), code);
}

/** Range from (startRow,startCol) through (endRow,endCol) inclusive. */
function sheetRect_(sheet, startRow, startCol, endRow, endCol) {
  return sheet.getRange(startRow, startCol, endRow - startRow + 1, endCol - startCol + 1);
}

function copyRowFormat_(sheet, fromRow, toRow) {
  var lastCol = sheet.getLastColumn();
  sheetRect_(sheet, fromRow, 1, fromRow, lastCol).copyTo(
    sheetRect_(sheet, toRow, 1, toRow, lastCol),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false,
  );
}

function athensDateString_() {
  return Utilities.formatDate(new Date(), "Europe/Athens", "yyyy-MM-dd");
}
