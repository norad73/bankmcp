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
