import { config } from "./config.ts";

export async function postTransactionsToSheet<T>(
  action: string,
  transactions: T[],
  sinceMs: number,
): Promise<{ transactions: T[]; sheet: Record<string, unknown> }> {
  const url = config.googleSheetsWebhookUrl;
  if (!url) throw new Error("Set GOOGLE_SHEETS_WEBHOOK_URL to your Google Apps Script web app URL.");
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new transactions", added: 0 } };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
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
  return { transactions, sheet };
}

export function filterNewByKnownIds<T extends { id: string }>(
  rows: T[],
  knownIds: Set<string>,
  sinceMs = 0,
  instantMs: (row: T) => number,
  extraKeys?: (row: T) => string[],
): T[] {
  return rows
    .filter((row) => {
      const keys = [row.id, ...(extraKeys?.(row) ?? [])].filter(Boolean);
      if (keys.some((key) => knownIds.has(key))) return false;
      return sinceMs <= 0 || instantMs(row) > sinceMs;
    })
    .sort((a, b) => instantMs(a) - instantMs(b));
}
