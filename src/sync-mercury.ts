import { config } from "./config.ts";
import {
  formatMercurySourceAccount,
  formatMercuryStatus,
  getMercuryCard,
  isMercuryConfigured,
  listMercuryAccounts,
  listMercuryTransactions,
  type MercuryAccount,
  type MercuryTransaction,
} from "./mercury.ts";
import { loadMercuryTransactionIds, rememberMercuryTransactionIds } from "./mercury-sync-store.ts";
import type { MercurySheetTransaction } from "./sheet-mercury.ts";

export type { MercurySheetTransaction };

function roundAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

function txInstant(tx: MercuryTransaction): number {
  const raw = tx.postedAt ?? tx.createdAt;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function glCode(tx: MercuryTransaction): string {
  if (tx.generalLedgerCodeName?.trim()) return tx.generalLedgerCodeName.trim();
  const fromAlloc = tx.glAllocations?.find((a) => a.glCodeName?.trim())?.glCodeName;
  return fromAlloc?.trim() ?? "";
}

function category(tx: MercuryTransaction): string {
  return tx.categoryData?.name?.trim() || tx.mercuryCategory?.trim() || "";
}

function reference(tx: MercuryTransaction): string {
  return tx.externalMemo?.trim() || tx.trackingNumber?.trim() || "";
}

function mapTransaction(
  tx: MercuryTransaction,
  accounts: Map<string, MercuryAccount>,
  cardNames: Map<string, string>,
): MercurySheetTransaction {
  const account = accounts.get(tx.accountId);
  const sourceAccount = account ? formatMercurySourceAccount(account) : "Mercury";
  const nameOnCard = tx.cardId ? (cardNames.get(tx.cardId) ?? "") : "";
  const instant = tx.postedAt ?? tx.createdAt;
  return {
    id: tx.id,
    dateUtc: instant,
    description: tx.counterpartyName?.trim() || "",
    amount: roundAmount(tx.amount),
    status: formatMercuryStatus(tx.status),
    sourceAccount,
    bankDescription: tx.bankDescription?.trim() ?? "",
    reference: reference(tx),
    note: tx.note?.trim() ?? "",
    nameOnCard,
    category: category(tx),
    glCode: glCode(tx),
  };
}

async function loadMercuryCardNames(cardIds: string[]): Promise<Map<string, string>> {
  const cardNames = new Map<string, string>();
  await Promise.all(
    cardIds.map(async (cardId) => {
      const card = await getMercuryCard(cardId);
      cardNames.set(cardId, card?.nameOnCard?.trim() ?? "");
    }),
  );
  return cardNames;
}

export async function fetchNewMercuryTransactions(sinceMs = 0): Promise<MercurySheetTransaction[]> {
  if (!isMercuryConfigured()) return [];
  const postedStart = sinceMs > 0 ? new Date(sinceMs).toISOString().slice(0, 10) : undefined;
  const [accounts, raw, known] = await Promise.all([
    listMercuryAccounts(),
    listMercuryTransactions({ postedStart, order: "asc" }),
    Promise.resolve(loadMercuryTransactionIds()),
  ]);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const pending = raw.filter((tx) => !known.has(tx.id) && (sinceMs <= 0 || txInstant(tx) > sinceMs));
  const cardIds = [...new Set(pending.map((tx) => tx.cardId).filter((id): id is string => Boolean(id)))];
  const cardNames = await loadMercuryCardNames(cardIds);
  return pending.map((tx) => mapTransaction(tx, accountMap, cardNames));
}

export async function syncMercuryTransactionsToSheet(sinceMs = 0): Promise<{ transactions: MercurySheetTransaction[]; sheet: Record<string, unknown> }> {
  const url = config.googleSheetsWebhookUrl;
  if (!url) throw new Error("Set GOOGLE_SHEETS_WEBHOOK_URL to your Google Apps Script web app URL.");

  const transactions = await fetchNewMercuryTransactions(sinceMs);
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Mercury transactions", added: 0 } };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "fill-mercury",
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
  rememberMercuryTransactionIds(transactions.map((t) => t.id));
  return { transactions, sheet };
}
