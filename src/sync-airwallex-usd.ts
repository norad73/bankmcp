import { config } from "./config.ts";
import { fetchBalanceActivityReportCsv, isAirwallexConfigured } from "./airwallex.ts";
import { loadAirwallexTransactionIds, rememberAirwallexTransactionIds } from "./airwallex-sync-store.ts";
import { parseCsv } from "./parse-csv.ts";
import type { AirwallexUsdSheetRow } from "./sheet-airwallex-usd.ts";

export type { AirwallexUsdSheetRow };

const BAR_HEADERS = [
  "Time",
  "Type",
  "Financial Transaction Type",
  "Transaction Id",
  "Description",
  "Wallet Currency",
  "Target Currency",
  "Target Amount",
  "Conversion Rate",
  "Mature Date",
  "Amount",
  "Fee",
  "Debit Net Amount",
  "Credit Net Amount",
  "Account Balance",
  "Available Balance",
  "Created At",
  "Request Id",
  "Reference",
  "Note to Self",
] as const;

function isoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function sinceToFromDate(sinceMs: number): string {
  if (sinceMs <= 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 7);
    return isoDate(d);
  }
  return isoDate(new Date(sinceMs));
}

function rowTimeMs(row: AirwallexUsdSheetRow): number {
  const ms = Date.parse(row.time);
  return Number.isFinite(ms) ? ms : 0;
}

function parseNumeric(value: string): string | number {
  const text = value.trim().replace(/,/g, "");
  if (!text) return "";
  const n = Number(text);
  return Number.isFinite(n) ? n : value.trim();
}

function mapBarRow(cols: Record<string, string>): AirwallexUsdSheetRow | null {
  const transactionId = cols["Transaction Id"]?.trim();
  if (!transactionId) return null;
  return {
    transactionId,
    time: cols.Time?.trim() ?? "",
    type: cols.Type?.trim() ?? "",
    financialTransactionType: cols["Financial Transaction Type"]?.trim() ?? "",
    description: cols.Description?.trim() ?? "",
    walletCurrency: cols["Wallet Currency"]?.trim() ?? "",
    targetCurrency: cols["Target Currency"]?.trim() ?? "",
    targetAmount: parseNumeric(cols["Target Amount"] ?? ""),
    conversionRate: parseNumeric(cols["Conversion Rate"] ?? ""),
    matureDate: cols["Mature Date"]?.trim() ?? "",
    amount: parseNumeric(cols.Amount ?? ""),
    fee: parseNumeric(cols.Fee ?? ""),
    debitNetAmount: parseNumeric(cols["Debit Net Amount"] ?? ""),
    creditNetAmount: parseNumeric(cols["Credit Net Amount"] ?? ""),
    availableBalance: parseNumeric(cols["Available Balance"] ?? ""),
    accountBalance: parseNumeric(cols["Account Balance"] ?? ""),
    createdAt: cols["Created At"]?.trim() ?? "",
    requestId: cols["Request Id"]?.trim() ?? "",
    reference: cols.Reference?.trim() ?? "",
    noteToSelf: cols["Note to Self"]?.trim() ?? "",
  };
}

export function parseBalanceActivityCsv(csv: string): AirwallexUsdSheetRow[] {
  const table = parseCsv(csv.trim());
  if (!table.length) return [];
  const header = table[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const required of BAR_HEADERS) {
    if (!(required in idx)) throw new Error(`Balance Activity CSV missing column: ${required}`);
  }
  const out: AirwallexUsdSheetRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cols: Record<string, string> = {};
    for (const name of BAR_HEADERS) {
      cols[name] = table[r][idx[name]!] ?? "";
    }
    const row = mapBarRow(cols);
    if (row) out.push(row);
  }
  return out;
}

export async function fetchNewAirwallexUsdTransactions(sinceMs = 0): Promise<AirwallexUsdSheetRow[]> {
  if (!isAirwallexConfigured()) return [];
  const fromDate = sinceToFromDate(sinceMs);
  const toDate = isoDate();
  const { csv } = await fetchBalanceActivityReportCsv({
    currency: "USD",
    fromDate,
    toDate,
    timeoutMs: 180_000,
  });
  const known = loadAirwallexTransactionIds();
  return parseBalanceActivityCsv(csv)
    .filter((row) => row.walletCurrency.toUpperCase() === "USD")
    .filter((row) => !known.has(row.transactionId))
    .filter((row) => sinceMs <= 0 || rowTimeMs(row) > sinceMs)
    .sort((a, b) => rowTimeMs(a) - rowTimeMs(b));
}

export async function syncAirwallexUsdTransactionsToSheet(sinceMs = 0): Promise<{ transactions: AirwallexUsdSheetRow[]; sheet: Record<string, unknown> }> {
  const url = config.googleSheetsWebhookUrl;
  if (!url) throw new Error("Set GOOGLE_SHEETS_WEBHOOK_URL to your Google Apps Script web app URL.");

  const transactions = await fetchNewAirwallexUsdTransactions(sinceMs);
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Airwallex USD transactions", added: 0 } };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "fill-airwallex-usd",
      source: "bankconnector",
      synced_at: new Date().toISOString(),
      sinceMs,
      transactions,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Sheets webhook ${res.status}: ${text.slice(0, 300)}`);
  let sheet: Record<string, unknown>;
  try {
    sheet = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Google Sheets webhook returned non-JSON: ${text.slice(0, 200)}`);
  }
  rememberAirwallexTransactionIds(transactions.map((t) => t.transactionId));
  return { transactions, sheet };
}
