// Read-only client for PayPal account balances.
// https://developer.paypal.com/docs/api/transaction-search/v1/balances-get
import { config } from "./config.ts";

export interface PayPalBalance {
  currency: string;
  available: number;
  total: number;
  withheld: number;
}

export class PayPalError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`PayPal API ${status}: ${body.slice(0, 300)}`);
    this.name = "PayPalError";
    this.status = status;
    this.body = body;
  }
}

let cachedToken: { token: string; expiresAt: number } | undefined;

function basicAuth(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

function moneyValue(raw: { currency_code?: string; value?: string } | undefined): number {
  if (!raw?.value) return 0;
  const n = Number(raw.value);
  return Number.isFinite(n) ? n : 0;
}

export function isPayPalConfigured(): boolean {
  return Boolean(config.paypalClientId && config.paypalSecret);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const res = await fetch(`${config.paypalApiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(config.paypalClientId, config.paypalSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const text = await res.text();
  if (!res.ok) throw new PayPalError(res.status, text);

  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new PayPalError(res.status, text);
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function paypalGet(path: string, retried = false): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${config.paypalApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 403 && !retried) {
      cachedToken = undefined;
      return paypalGet(path, true);
    }
    throw new PayPalError(res.status, text);
  }
  return text ? JSON.parse(text) : {};
}

export async function listPayPalBalances(): Promise<PayPalBalance[]> {
  if (!isPayPalConfigured()) return [];
  const data = (await paypalGet("/v1/reporting/balances")) as {
    balances?: {
      currency?: string;
      available_balance?: { value?: string };
      total_balance?: { value?: string };
      withheld_balance?: { value?: string };
    }[];
  };
  return (data.balances ?? [])
    .map((b): PayPalBalance | undefined => {
      const currency = b.currency?.toUpperCase();
      if (!currency) return undefined;
      const available = moneyValue(b.available_balance);
      const total = moneyValue(b.total_balance);
      const withheld = moneyValue(b.withheld_balance);
      return { currency, available, total, withheld };
    })
    .filter((b): b is PayPalBalance => Boolean(b))
    .filter((b) => b.available !== 0 || b.total !== 0 || b.withheld !== 0);
}
