import { isCledaraConfigured, listCledaraTransactions } from "./cledara.ts";
import { loadCledaraTransactionIds, rememberCledaraTransactionIds } from "./cledara-sync-store.ts";
import type { CledaraSheetTransaction } from "./sheet-cledara.ts";
import { postTransactionsToSheet } from "./sync-to-sheet.ts";
import { uniqueId } from "./unique-id.ts";

const MAX_NEW_PER_RUN = 50;

function roundAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCledaraDate(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function txInstant(tx: CledaraSheetTransaction): number {
  const m = tx.origDate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return 0;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function dateAmountKey(origDate: string, amount: number): string {
  return `${origDate}|${roundAmount(amount)}`;
}

function isKnownCledaraRow(
  tx: CledaraSheetTransaction,
  knownIds: Set<string>,
  knownDateAmount: Set<string>,
): boolean {
  if (knownIds.has(tx.id)) return true;
  if (knownIds.has(uniqueId([tx.origDate, tx.description, tx.amount]))) return true;
  if (knownDateAmount.has(dateAmountKey(tx.origDate, tx.amount))) return true;
  if (knownIds.has(`${tx.origDate}|${tx.description}|${tx.amount}`)) return true;
  return false;
}

export async function syncCledaraTransactionsToSheet(
  sinceMs: number,
  knownIds: string[],
  knownDateAmountKeys: string[] = [],
) {
  if (!isCledaraConfigured()) {
    throw new Error("CLEDARA_API_TOKEN is not set on Render. Add it under Environment (Cledara → Profile → API Keys).");
  }
  const known = new Set([...knownIds, ...loadCledaraTransactionIds()]);
  const knownDateAmount = new Set(knownDateAmountKeys);
  const from = sinceMs > 0 ? new Date(sinceMs).toISOString() : new Date(Date.now() - 90 * 86_400_000).toISOString();

  const raw = (await listCledaraTransactions({ from, maxResults: 500 }))
    .map((t): CledaraSheetTransaction | null => {
      const iso = t.settledAt ?? t.createdAt;
      const origDate = iso ? toCledaraDate(iso) : null;
      if (!origDate) return null;
      return {
        id: t.id,
        origDate,
        description: t.description,
        amount: roundAmount(t.amount),
        direction: t.amount >= 0 ? "IN" : "OUT",
      };
    })
    .filter((t): t is CledaraSheetTransaction => Boolean(t));

  const pending = raw
    .filter((row) => {
      if (isKnownCledaraRow(row, known, knownDateAmount)) return false;
      return sinceMs <= 0 || txInstant(row) > sinceMs;
    })
    .sort((a, b) => txInstant(a) - txInstant(b));

  const transactions = pending.slice(0, MAX_NEW_PER_RUN);
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Cledara transactions", added: 0 } };
  }

  const result = await postTransactionsToSheet("fill-cledara", transactions, sinceMs);
  rememberCledaraTransactionIds(transactions.map((t) => t.id));
  const sheet = {
    ...result.sheet,
    ...(pending.length > MAX_NEW_PER_RUN ? { partial: true, remaining: pending.length - MAX_NEW_PER_RUN } : {}),
  };
  return { transactions, sheet };
}
