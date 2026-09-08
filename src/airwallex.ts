// Read-only client for Airwallex balances.
// https://www.airwallex.com/docs/api/authentication/api_access_token/login
import { config } from "./config.ts";

export interface AirwallexBalance {
  accountType: string;
  currency: string;
  available: number;
  pending?: number;
  reserved?: number;
  total?: number;
}

export class AirwallexError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Airwallex API ${status}: ${body.slice(0, 300)}`);
    this.name = "AirwallexError";
    this.status = status;
    this.body = body;
  }
}

let cachedToken: { token: string; expiresAt: number } | undefined;

export function isAirwallexConfigured(): boolean {
  return Boolean(config.airwallexClientId && config.airwallexApiKey);
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
  }
  return undefined;
}

function normalizeBalance(raw: Record<string, unknown>): AirwallexBalance | undefined {
  const currency = pickString(raw, "currency");
  const available = pickNumber(raw, "available_amount", "availableAmount");
  if (!currency || available === undefined) return undefined;
  return {
    accountType: pickString(raw, "account_type", "accountType") ?? "cash",
    currency,
    available,
    pending: pickNumber(raw, "pending_amount", "pendingAmount"),
    reserved: pickNumber(raw, "reserved_amount", "reservedAmount"),
    total: pickNumber(raw, "total_amount", "totalAmount"),
  };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": "0",
    "x-client-id": config.airwallexClientId,
    "x-api-key": config.airwallexApiKey,
  };
  if (config.airwallexAccountId) headers["x-login-as"] = config.airwallexAccountId;

  const res = await fetch(`${config.airwallexApiBase}/api/v1/authentication/login`, { method: "POST", headers });
  const text = await res.text();
  if (!res.ok) throw new AirwallexError(res.status, text);

  const data = JSON.parse(text) as { token?: string; expires_at?: string };
  if (!data.token) throw new AirwallexError(res.status, text);
  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : Date.now() + 30 * 60_000;
  cachedToken = { token: data.token, expiresAt };
  return data.token;
}

async function airwallexGet(path: string): Promise<unknown> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (config.airwallexAccountId) headers["x-login-as"] = config.airwallexAccountId;

  const res = await fetch(`${config.airwallexApiBase}${path}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new AirwallexError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export async function listAirwallexBalances(): Promise<AirwallexBalance[]> {
  if (!isAirwallexConfigured()) return [];
  const data = await airwallexGet("/api/v1/balances/current");
  const list = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return list.map(normalizeBalance).filter((b): b is AirwallexBalance => Boolean(b));
}
