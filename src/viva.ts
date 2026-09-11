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

async function vivaAccountGet(path: string): Promise<unknown> {
  const res = await fetch(`${config.vivaAccountApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: basicAuth(config.vivaBasicUser, config.vivaBasicPassword),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new VivaError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export async function listVivaAccountTransactions(sinceMs = 0, walletId?: number): Promise<VivaAccountTransaction[]> {
  if (!isVivaConfigured()) return [];
  const end = new Date();
  const start = sinceMs > 0 ? new Date(sinceMs) : new Date(end.getTime() - 120 * 86_400_000);
  const params = new URLSearchParams({
    date_from: start.toISOString().slice(0, 10),
    date_to: end.toISOString().slice(0, 10),
  });
  if (walletId) params.set("walletId", String(walletId));
  const data = (await vivaAccountGet(`/walletaccounts/v1/transactions?${params}`)) as
    | Array<Record<string, unknown>>
    | { transactions?: Array<Record<string, unknown>> };
  const list = Array.isArray(data) ? data : (data.transactions ?? []);
  return list.map(normalizeVivaTransaction).filter((t): t is VivaAccountTransaction => Boolean(t));
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
    description: String(raw.description ?? raw.internalDescription ?? raw.name ?? "").trim(),
    amount,
    balance: raw.targetAmount !== undefined ? Number(raw.targetAmount) : undefined,
  };
}
