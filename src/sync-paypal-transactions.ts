import { listPayPalTransactions } from "./paypal.ts";
import type { PayPalSheetTransaction } from "./sheet-paypal.ts";
import { filterNewByKnownIds, postTransactionsToSheet } from "./sync-to-sheet.ts";

function txInstant(tx: PayPalSheetTransaction): number {
  const m = tx.date.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return 0;
  const iso = `${m[3]}-${m[1]}-${m[2]}T${tx.time || "00:00:00"}Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export async function syncPaypalTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  const known = new Set(knownIds);
  const raw = (await listPayPalTransactions(sinceMs)).map((t) => ({ ...t, transactionId: t.id } as PayPalSheetTransaction));
  const transactions = filterNewByKnownIds(raw, known, sinceMs, txInstant);
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Paypal transactions", added: 0 } };
  }
  return postTransactionsToSheet("fill-paypal", transactions, sinceMs);
}
