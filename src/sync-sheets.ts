// Fetches booked balances for every linked account and POSTs them to a Google
// Apps Script web app. Invoked by POST /cron/sync-balances or `npm run sync-sheets`.
import { config, isConfigured } from "./config.ts";
import { describeAccount, isoDate, simplifyBalances } from "./data.ts";
import { eb, EnableBankingError } from "./enablebanking.ts";
import { store } from "./store.ts";

export interface BalanceRow {
  date: string;
  account: string;
  uid: string;
  iban?: string;
  currency: string;
  booked?: number;
  available?: number;
  error?: string;
}

export async function fetchAllBalances(): Promise<{ rows: BalanceRow[] }> {
  if (!isConfigured()) throw new Error("BankMCP is not configured yet.");

  const s = store();
  const accounts = s.accounts();
  if (!accounts.length) throw new Error("No accounts linked yet. Connect a bank first.");

  const date = isoDate();
  const rows: BalanceRow[] = [];
  for (const account of accounts) {
    const base = describeAccount(account, s.data.sessions[account.session_id]);
    try {
      const balances = simplifyBalances(await eb.getBalances(account.uid));
      rows.push({
        date,
        account: base.label ?? base.name ?? account.uid,
        uid: account.uid,
        iban: account.iban,
        currency: account.currency,
        booked: balances.booked,
        available: balances.available,
      });
    } catch (err) {
      const msg = err instanceof EnableBankingError ? `${err.status}${err.consentGone ? " (consent expired)" : ""}` : (err as Error).message;
      rows.push({
        date,
        account: base.label ?? base.name ?? account.uid,
        uid: account.uid,
        iban: account.iban,
        currency: account.currency,
        error: msg,
      });
    }
  }

  return { rows };
}

export async function syncBalancesToSheet(): Promise<{ rows: BalanceRow[] }> {
  const url = config.googleSheetsWebhookUrl;
  if (!url) throw new Error("Set GOOGLE_SHEETS_WEBHOOK_URL to your Google Apps Script web app URL.");

  const { rows } = await fetchAllBalances();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "bankmcp", synced_at: new Date().toISOString(), rows }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Sheets webhook ${res.status}: ${text.slice(0, 300)}`);
  return { rows };
}
