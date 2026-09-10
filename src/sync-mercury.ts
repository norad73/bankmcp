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
import { hasMercuryTransactionId, rememberMercuryTransactionIds } from "./mercury-sync-store.ts";
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

async function mapTransaction(
  tx: MercuryTransaction,
  accounts: Map<string, MercuryAccount>,
  cardNames: Map<string, string>,
): Promise<MercurySheetTransaction> {
  const account = accounts.get(tx.accountId);
  const sourceAccount = account ? formatMercurySourceAccount(account) : "Mercury";
  let nameOnCard = "";
  if (tx.cardId) {
    if (cardNames.has(tx.cardId)) {
      nameOnCard = cardNames.get(tx.cardId) ?? "";
    } else {
      const card = await getMercuryCard(tx.cardId);
      nameOnCard = card?.nameOnCard?.trim() ?? "";
      cardNames.set(tx.cardId, nameOnCard);
    }
  }
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

export async function fetchNewMercuryTransactions(sinceMs = 0): Promise<MercurySheetTransaction[]> {
  if (!isMercuryConfigured()) return [];
  const postedStart = sinceMs > 0 ? new Date(sinceMs).toISOString().slice(0, 10) : undefined;
  const [accounts, raw] = await Promise.all([listMercuryAccounts(), listMercuryTransactions({ postedStart, order: "asc" })]);
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const cardNames = new Map<string, string>();
  const out: MercurySheetTransaction[] = [];
  for (const tx of raw) {
    if (hasMercuryTransactionId(tx.id)) continue;
    if (sinceMs > 0 && txInstant(tx) <= sinceMs) continue;
    out.push(await mapTransaction(tx, accountMap, cardNames));
  }
  return out;
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
