// BankConnector — shared helpers for Google Sheets scripts.
// Script version: 0.5.2 (keep in sync with BankConnector app version)

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

function bankConnectorHttpHint_(code, path) {
  if (code === 401) {
    return "CRON_SECRET in Script properties does not match Render. Copy CRON_SECRET from Render → Environment.";
  }
  if (code === 404) {
    return "Route not found on the server. The deployed BankConnector is probably older than this sheet script "
      + "(needs v0.5.0+ for " + path + "). Push the latest code and redeploy on Render.";
  }
  if (code === 403) return "Forbidden — check CRON_SECRET and that the web app URL is correct.";
  if (code === 502 || code === 504) {
    return "Render timed out (30s). Large first syncs are batched — run again. If it persists, check Render logs.";
  }
  if (code >= 500) return "Server error — check Render logs for BankConnector.";
  return "Check BANKCONNECTOR_URL and CRON_SECRET in Script properties.";
}

function bankConnectorResponsePreview_(text, maxLen) {
  var preview = String(text || "").replace(/\s+/g, " ").trim();
  if (preview.length > maxLen) preview = preview.slice(0, maxLen) + "…";
  return preview || "(empty body)";
}

function formatBankConnectorHttpError_(url, code, text) {
  var lines = [
    "BankConnector request failed",
    "",
    "URL: " + url,
    "HTTP: " + code,
    "",
    bankConnectorHttpHint_(code, url.replace(/^https?:\/\/[^/]+/, "")),
  ];
  var trimmed = String(text || "").trim();
  if (trimmed.charAt(0) === "{") {
    try {
      var data = JSON.parse(trimmed);
      if (data.error) lines.push("", "Server: " + data.error);
    } catch (ignore) {}
  } else if (trimmed) {
    lines.push("", "Response: " + bankConnectorResponsePreview_(trimmed, 240));
  }
  return lines.join("\n");
}

function parseBankConnectorResponse_(text, code, url) {
  var data;
  try {
    data = JSON.parse(text);
  } catch (parseErr) {
    throw new Error(formatBankConnectorHttpError_(url, code, text));
  }
  if (code >= 400) {
    throw new Error(formatBankConnectorHttpError_(url, code, data.error ? JSON.stringify({ error: data.error }) : text));
  }
  if (data.action) return data;
  if (data.ok === false) throw new Error(formatBankConnectorHttpError_(url, code, data.error || text));
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
  var text = res.getContentText();
  log_("BankConnector response", { http: code, bytes: text.length, url: url });
  return parseBankConnectorResponse_(text, code, url);
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
