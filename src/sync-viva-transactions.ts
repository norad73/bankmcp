import { listVivaAccountTransactions, listVivaWallets } from "./viva.ts";
import type { VivaSheetTransaction } from "./sheet-viva.ts";
import { filterNewByKnownIds, postTransactionsToSheet } from "./sync-to-sheet.ts";

function toVivaDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

function txInstant(tx: VivaSheetTransaction): number {
  const ms = Date.parse(String(tx.transactionDate || tx.valueDate));
  return Number.isFinite(ms) ? ms : 0;
}

export async function syncVivaTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  const known = new Set(knownIds);
  const wallets = await listVivaWallets();
  const walletId = wallets.find((w) => w.currency === "EUR")?.walletId ?? wallets[0]?.walletId;
  const raw = (await listVivaAccountTransactions(sinceMs, walletId)).map((t): VivaSheetTransaction => ({
    id: t.id,
    transactionDate: toVivaDate(t.created),
    valueDate: t.valueDate ? toVivaDate(t.valueDate) : toVivaDate(t.created),
    description: t.description,
    origAmount: t.amount,
    balance: t.balance,
  }));
  const transactions = filterNewByKnownIds(raw, known, sinceMs, txInstant, (row) => [
    `${row.transactionDate}|${row.description}|${row.origAmount}`,
  ]);
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Viva transactions", added: 0 } };
  }
  return postTransactionsToSheet("fill-viva", transactions, sinceMs);
}
