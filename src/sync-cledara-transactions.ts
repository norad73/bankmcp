import { isCledaraConfigured, listCledaraTransactions } from "./cledara.ts";
import type { CledaraSheetTransaction } from "./sheet-cledara.ts";
import { filterNewByKnownIds, postTransactionsToSheet } from "./sync-to-sheet.ts";

const MAX_NEW_PER_RUN = 50;

function toCledaraDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function txInstant(tx: CledaraSheetTransaction): number {
  const m = tx.origDate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return 0;
  return Date.parse(`${m[3]}-${m[2]}-${m[1]}`);
}

export async function syncCledaraTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  if (!isCledaraConfigured()) {
    throw new Error("CLEDARA_API_TOKEN is not set on Render. Add it under Environment (Cledara → Profile → API Keys).");
  }

  const known = new Set(knownIds);
  const from = sinceMs > 0 ? new Date(sinceMs).toISOString() : new Date(Date.now() - 90 * 86_400_000).toISOString();
  const raw = (await listCledaraTransactions({ from, maxResults: 500 })).map((t): CledaraSheetTransaction => ({
    id: t.id,
    origDate: toCledaraDate(t.settledAt ?? t.createdAt ?? new Date().toISOString()),
    description: t.description,
    amount: t.amount,
    direction: t.amount >= 0 ? "IN" : "OUT",
  }));
  const pending = filterNewByKnownIds(raw, known, sinceMs, txInstant, (row) => [
    `${row.origDate}|${row.description}|${row.amount}`,
  ]);
  const transactions = pending.slice(0, MAX_NEW_PER_RUN);
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Cledara transactions", added: 0 } };
  }

  const result = await postTransactionsToSheet("fill-cledara", transactions, sinceMs);
  const sheet = {
    ...result.sheet,
    ...(pending.length > MAX_NEW_PER_RUN ? { partial: true, remaining: pending.length - MAX_NEW_PER_RUN } : {}),
  };
  return { transactions, sheet };
}
