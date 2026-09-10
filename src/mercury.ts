// Read-only client for Mercury account balances.
// https://docs.mercury.com/reference/getaccounts
import { config } from "./config.ts";

export interface MercuryAccount {
  id: string;
  name: string;
  nickname?: string | null;
  accountNumber?: string;
  kind?: string;
  availableBalance: number;
  currentBalance: number;
  status: string;
  type: string;
}

export interface MercuryTransaction {
  id: string;
  amount: number;
  status: string;
  counterpartyName: string;
  bankDescription?: string | null;
  externalMemo?: string | null;
  note?: string | null;
  postedAt?: string | null;
  createdAt: string;
  accountId: string;
  cardId?: string | null;
  trackingNumber?: string | null;
  categoryData?: { name?: string } | null;
  mercuryCategory?: string | null;
  generalLedgerCodeName?: string | null;
  glAllocations?: { glCodeName?: string }[];
}

export interface MercuryCard {
  id: string;
  lastFourDigits?: string;
  nameOnCard?: string;
}

export class MercuryError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Mercury API ${status}: ${body.slice(0, 300)}`);
    this.name = "MercuryError";
    this.status = status;
    this.body = body;
  }
}

export function isMercuryConfigured(): boolean {
  return Boolean(config.mercuryApiToken);
}

async function mercuryGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.mercuryApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.mercuryApiToken}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new MercuryError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function listMercuryAccounts(): Promise<MercuryAccount[]> {
  if (!isMercuryConfigured()) return [];
  const accounts: MercuryAccount[] = [];
  let startAfter: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ limit: "1000" });
    if (startAfter) params.set("start_after", startAfter);
    const data = await mercuryGet<{ accounts?: MercuryAccount[]; page?: { nextPage?: string } }>(`/accounts?${params}`);
    for (const account of data.accounts ?? []) {
      if (account.type !== "mercury" || account.status !== "active") continue;
      accounts.push(account);
    }
    const next = data.page?.nextPage;
    if (!next || next === startAfter) break;
    startAfter = next;
  }
  return accounts;
}

export function formatMercurySourceAccount(account: MercuryAccount): string {
  const label = account.nickname?.trim() || account.name?.trim() || account.kind?.trim() || "Checking";
  const last4 = account.accountNumber?.slice(-4) ?? "????";
  return `Mercury ${label} ••${last4}`;
}

export function formatMercuryStatus(status: string): string {
  const s = status.trim();
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export async function listMercuryTransactions(opts: { postedStart?: string; order?: "asc" | "desc" } = {}): Promise<MercuryTransaction[]> {
  if (!isMercuryConfigured()) return [];
  const transactions: MercuryTransaction[] = [];
  let startAfter: string | undefined;
  const order = opts.order ?? "asc";
  for (;;) {
    const params = new URLSearchParams({ limit: "1000", order });
    if (opts.postedStart) params.set("postedStart", opts.postedStart);
    if (startAfter) params.set("start_after", startAfter);
    const data = await mercuryGet<{ transactions?: MercuryTransaction[]; page?: { nextPage?: string } }>(`/transactions?${params}`);
    transactions.push(...(data.transactions ?? []));
    const next = data.page?.nextPage;
    if (!next || next === startAfter) break;
    startAfter = next;
  }
  return transactions;
}

export async function getMercuryCard(cardId: string): Promise<MercuryCard | null> {
  if (!isMercuryConfigured() || !cardId) return null;
  try {
    return await mercuryGet<MercuryCard>(`/cards/${encodeURIComponent(cardId)}`);
  } catch {
    return null;
  }
}
