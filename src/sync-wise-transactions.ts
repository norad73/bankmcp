import { listWiseStatementTransactions } from "./wise.ts";
import type { WiseEurSheetTransaction } from "./sheet-wise-eur.ts";
import type { WiseUsdSheetTransaction } from "./sheet-wise-usd.ts";
import { filterNewByKnownIds, postTransactionsToSheet } from "./sync-to-sheet.ts";

function wiseInstantMs(date: string): number {
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? ms : 0;
}

function formatWiseDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function formatWiseDateSlash(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function mapWiseUsd(raw: Awaited<ReturnType<typeof listWiseStatementTransactions>>[number]): WiseUsdSheetTransaction {
  return {
    id: raw.referenceNumber,
    transferWiseId: raw.referenceNumber,
    wiseDate: formatWiseDate(raw.date),
    wiseDatetime: raw.date.replace("T", " ").replace(/\.\d+Z$/, "").replace(/Z$/, ""),
    wiseAmount: raw.amount,
    currency: raw.currency,
    description: raw.description,
    paymentReference: raw.paymentReference,
    runningBalance: raw.runningBalance,
    exchangeFrom: raw.exchangeFrom,
    exchangeTo: raw.exchangeTo,
    exchangeRate: raw.exchangeRate,
    payerName: raw.payerName,
    payeeName: raw.payeeName,
    payeeAccountNumber: raw.payeeAccountNumber,
    merchant: raw.merchant,
    totalFees: raw.totalFees,
    exchangeToAmount: raw.exchangeToAmount,
    transactionType: raw.type,
    transactionDetailsType: raw.detailsType,
  };
}

function mapWiseEur(raw: Awaited<ReturnType<typeof listWiseStatementTransactions>>[number]): WiseEurSheetTransaction {
  return {
    id: raw.referenceNumber,
    transferWiseId: raw.referenceNumber,
    originalDate: formatWiseDateSlash(raw.date),
    dateTime: raw.date.replace("T", " ").replace(/\.\d+Z$/, "").replace(/Z$/, ""),
    originalAmount: raw.amount,
    currency: raw.currency,
    description: raw.description,
    paymentReference: raw.paymentReference,
    runningBalance: raw.runningBalance,
    exchangeFrom: raw.exchangeFrom,
    exchangeTo: raw.exchangeTo,
    exchangeRate: raw.exchangeRate,
    payerName: raw.payerName,
    payeeName: raw.payeeName,
    payeeAccountNumber: raw.payeeAccountNumber,
    merchant: raw.merchant,
    totalFees: raw.totalFees,
    exchangeToAmount: raw.exchangeToAmount,
    transactionType: raw.type,
    transactionDetailsType: raw.detailsType,
    sheetExchangeRate: raw.exchangeRate,
  };
}

export async function syncWiseUsdTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  const known = new Set(knownIds);
  const raw = (await listWiseStatementTransactions("USD", sinceMs)).map(mapWiseUsd);
  const transactions = filterNewByKnownIds(raw, known, sinceMs, (tx) => wiseInstantMs(tx.wiseDatetime || tx.wiseDate));
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Wise USD transactions", added: 0 } };
  }
  return postTransactionsToSheet("fill-wise-usd", transactions, sinceMs);
}

export async function syncWiseEurTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  const known = new Set(knownIds);
  const raw = (await listWiseStatementTransactions("EUR", sinceMs)).map(mapWiseEur);
  const transactions = filterNewByKnownIds(raw, known, sinceMs, (tx) => wiseInstantMs(tx.dateTime || tx.originalDate));
  if (!transactions.length) {
    return { transactions: [], sheet: { ok: true, action: "skip", reason: "No new Wise EUR transactions", added: 0 } };
  }
  return postTransactionsToSheet("fill-wise-eur", transactions, sinceMs);
}
