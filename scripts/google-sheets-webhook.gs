// Deploy as a Google Apps Script web app (Execute as: Me, Who has access: Anyone).
// Paste the deployment URL into GOOGLE_SHEETS_WEBHOOK_URL on Render.
const SHEET_NAME = "Balances";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["date", "account", "uid", "iban", "currency", "booked", "available", "error", "synced_at"]);
  }
  const syncedAt = body.synced_at || new Date().toISOString();
  for (const row of body.rows || []) {
    sheet.appendRow([
      row.date,
      row.account,
      row.uid,
      row.iban || "",
      row.currency,
      row.booked ?? "",
      row.available ?? "",
      row.error || "",
      syncedAt,
    ]);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true, appended: (body.rows || []).length }))
    .setMimeType(ContentService.MimeType.JSON);
}
