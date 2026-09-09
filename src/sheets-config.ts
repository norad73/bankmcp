import { config, saveSettings } from "./config.ts";

const DEFAULT_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbzMTw0tY0QaLoHXEHdeXaA4WVdWgesy4xDgTkFSYNgiQx7iC4VM1KcU_b_HeSgO32semQ/exec";

/** Persist the Google Sheets webhook URL when not set via env. */
export function ensureGoogleSheetsWebhook(url = DEFAULT_WEBHOOK_URL): void {
  if (config.googleSheetsWebhookUrl) return;
  saveSettings({ google_sheets_webhook_url: url });
  console.log(`[bank] configured Google Sheets webhook`);
}
