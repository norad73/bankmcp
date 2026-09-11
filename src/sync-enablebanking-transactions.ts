import { round2, sessionName, simplifyTransaction } from "./data.ts";
import { eb, type Transaction } from "./enablebanking.ts";
import type { EurobankSheetTransaction } from "./sheet-eurobank.ts";
import { filterNewByKnownIds, postTransactionsToSheet } from "./sync-to-sheet.ts";
import { store } from "./store.ts";

export interface EurobankSyncConfig {
  sessionLabel: string;
  webhookAction: string;
  skipReason: string;
}

function parseGreekAmount(value: string): number {
  const text = value.trim();
  if (!text) return 0;
  if (text.includes(",") && text.includes(".")) return round2(Number(text.replace(/\./g, "").replace(",", ".")));
  if (text.includes(",")) return round2(Number(text.replace(",", ".")));
  return round2(Number(text));
}

function toSheetDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function txInstant(tx: EurobankSheetTransaction): number {
  const ms = Date.parse(tx.bookingDate.split("/").reverse().join("-"));
  return Number.isFinite(ms) ? ms : 0;
}

function mapEurobankTransaction(t: Transaction): EurobankSheetTransaction {
  const simple = simplifyTransaction(t);
  const id = simple.id;
  return {
    id,
    bookingDate: toSheetDate(simple.date),
    valueDate: toSheetDate(simple.value_date ?? simple.date),
    description: [simple.description, simple.counterparty].filter(Boolean).join(" — ") || simple.counterparty || "",
    amount: simple.amount,
    balance: simple.balance_after,
  };
}

async function fetchEnableBankingTransactions(sessionLabel: string, sinceMs: number): Promise<EurobankSheetTransaction[]> {
  const s = store();
  const session = s.sessions().find((item) => sessionName(item).toLowerCase() === sessionLabel.toLowerCase());
  if (!session) throw new Error(`No Enable Banking session labeled "${sessionLabel}"`);
  const account = s.accounts().find((a) => a.session_id === session.id);
  if (!account) throw new Error(`No account linked for "${sessionLabel}"`);

  const dateFrom = sinceMs > 0
    ? new Date(sinceMs).toISOString().slice(0, 10)
    : new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const rows: EurobankSheetTransaction[] = [];
  let continuation: string | undefined;
  do {
    const page = await eb.getTransactionPage(account.uid, { dateFrom, continuationKey: continuation });
    rows.push(...(page.transactions ?? []).map(mapEurobankTransaction));
    continuation = page.continuation_key;
  } while (continuation && rows.length < 500);

  return rows.sort((a, b) => txInstant(a) - txInstant(b));
}

export async function syncEurobankTransactionsToSheet(
  cfg: EurobankSyncConfig,
  sinceMs: number,
  knownIds: string[],
): Promise<{ transactions: EurobankSheetTransaction[]; sheet: Record<string, unknown> }> {
  const known = new Set(knownIds);
  const raw = await fetchEnableBankingTransactions(cfg.sessionLabel, sinceMs);
  const transactions = filterNewByKnownIds(raw, known, sinceMs, txInstant, (row) => [
    `${row.bookingDate}|${row.description}|${row.amount}`,
  ]);
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: cfg.skipReason, added: 0 } };
  }
  return postTransactionsToSheet(cfg.webhookAction, transactions, sinceMs);
}

export { parseGreekAmount, toSheetDate };
