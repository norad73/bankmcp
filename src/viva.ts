// Read-only client for the Viva Wallet legacy API (Basic Auth).
// https://developer.viva.com/apis-for-payments/wallet-api/
import { config } from "./config.ts";

export interface VivaWallet {
  walletId: number;
  friendlyName?: string;
  currency: string;
  available: number;
  pending?: number;
  reserved?: number;
  iban?: string;
}

export class VivaError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Viva API ${status}: ${body.slice(0, 300)}`);
    this.name = "VivaError";
    this.status = status;
    this.body = body;
  }
}

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

function pickNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && v !== "") return Number(v);
  }
  return undefined;
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

const ISO_NUMERIC_CURRENCY: Record<string, string> = {
  "978": "EUR",
  "840": "USD",
  "826": "GBP",
};

function currencyCode(raw: Record<string, unknown>): string | undefined {
  const code = pickString(raw, "CurrencyCode", "currencyCode", "currency");
  if (!code) return undefined;
  return ISO_NUMERIC_CURRENCY[code] ?? code;
}

function normalizeWallet(raw: Record<string, unknown>): VivaWallet | undefined {
  const walletId = pickNumber(raw, "WalletId", "walletId", "Id", "id");
  const currency = currencyCode(raw);
  const available = pickNumber(raw, "Available", "available", "Amount", "amount");
  if (walletId === undefined || !currency || available === undefined) return undefined;
  return {
    walletId,
    friendlyName: pickString(raw, "FriendlyName", "friendlyName", "Name", "name"),
    currency,
    available,
    pending: pickNumber(raw, "Pending", "pending"),
    reserved: pickNumber(raw, "Reserved", "reserved"),
    iban: pickString(raw, "Iban", "iban"),
  };
}

export function isVivaConfigured(): boolean {
  return Boolean(config.vivaBasicUser && config.vivaBasicPassword);
}

export function isVivaAccountTransactionsConfigured(): boolean {
  return Boolean(config.vivaAccountClientId && config.vivaAccountClientSecret);
}

async function vivaGet(path: string): Promise<unknown> {
  const res = await fetch(`${config.vivaApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(config.vivaBasicUser, config.vivaBasicPassword),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new VivaError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export async function listVivaWallets(): Promise<VivaWallet[]> {
  if (!isVivaConfigured()) return [];
  const data = await vivaGet("/api/wallets");
  const list = (Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>).Wallets)
      ? (data as Record<string, unknown>).Wallets
      : Array.isArray((data as Record<string, unknown>).wallets)
        ? (data as Record<string, unknown>).wallets
        : [data]) as Record<string, unknown>[];
  return list.map(normalizeWallet).filter((w): w is VivaWallet => Boolean(w));
}

export interface VivaAccountTransaction {
  id: string;
  created: string;
  valueDate?: string;
  description: string;
  amount: number;
  balance?: number;
}

let cachedAccountToken: { token: string; expiresAt: number } | undefined;

async function vivaAccountAccessToken(): Promise<string> {
  if (!isVivaAccountTransactionsConfigured()) {
    throw new VivaError(
      401,
      "Account Transactions credentials missing. Set VIVA_ACCOUNT_CLIENT_ID and VIVA_ACCOUNT_CLIENT_SECRET (Viva → Settings → API Access → Account Transactions credentials).",
    );
  }
  if (cachedAccountToken && cachedAccountToken.expiresAt > Date.now() + 60_000) {
    return cachedAccountToken.token;
  }
  const res = await fetch(`${config.vivaAccountsBase}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(config.vivaAccountClientId, config.vivaAccountClientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const text = await res.text();
  if (!res.ok) throw new VivaError(res.status, text);
  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new VivaError(res.status, text);
  cachedAccountToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function vivaAccountGet(path: string, retried = false): Promise<unknown> {
  const token = await vivaAccountAccessToken();
  const res = await fetch(`${config.vivaAccountApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 && !retried) {
      cachedAccountToken = undefined;
      return vivaAccountGet(path, true);
    }
    throw new VivaError(res.status, text);
  }
  return text ? JSON.parse(text) : {};
}

function extractVivaTransactionPage(data: unknown): { items: Record<string, unknown>[]; totalPages: number } {
  if (Array.isArray(data)) return { items: data, totalPages: 1 };
  const obj = data as Record<string, unknown>;
  const items = Array.isArray(obj.data)
    ? obj.data
    : Array.isArray(obj.transactions)
      ? obj.transactions
      : [];
  return { items, totalPages: Math.max(1, Number(obj.totalPages ?? 1)) };
}

async function listVivaAccountTransactionsPage(
  start: Date,
  end: Date,
  walletId: number | undefined,
  page: number,
): Promise<{ items: Record<string, unknown>[]; totalPages: number }> {
  const params = new URLSearchParams({
    date_from: start.toISOString().slice(0, 10),
    date_to: end.toISOString().slice(0, 10),
    page: String(page),
  });
  if (walletId) params.set("walletId", String(walletId));
  const data = await vivaAccountGet(`/walletaccounts/v1/transactions?${params}`);
  return extractVivaTransactionPage(data);
}

export async function listVivaAccountTransactions(sinceMs = 0, walletId?: number): Promise<VivaAccountTransaction[]> {
  if (!isVivaAccountTransactionsConfigured()) return [];
  const end = new Date();
  const start = sinceMs > 0 ? new Date(sinceMs) : new Date(end.getTime() - 120 * 86_400_000);
  const seen = new Set<string>();
  const rows: VivaAccountTransaction[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const batch = await listVivaAccountTransactionsPage(start, end, walletId, page);
    totalPages = batch.totalPages;
    for (const raw of batch.items) {
      const tx = normalizeVivaTransaction(raw);
      if (!tx || seen.has(tx.id)) continue;
      seen.add(tx.id);
      rows.push(tx);
    }
    page += 1;
  } while (page <= totalPages);
  return rows;
}

function normalizeVivaTransaction(raw: Record<string, unknown>): VivaAccountTransaction | null {
  const id = String(raw.accountTransactionId ?? raw.walletTransactionId ?? raw.transactionId ?? raw.id ?? "").trim();
  if (!id) return null;
  const amount = Number(raw.amount ?? raw.signedAmount);
  if (!Number.isFinite(amount)) return null;
  return {
    id,
    created: String(raw.created ?? raw.createdDate ?? raw.transactionDate ?? ""),
    valueDate: typeof raw.valueDate === "string" ? raw.valueDate : undefined,
    description: String(raw.userDescription ?? raw.description ?? raw.internalDescription ?? raw.counterPart ?? raw.name ?? "").trim(),
    amount,
    balance: raw.targetAmount !== undefined ? Number(raw.targetAmount) : undefined,
  };
}
