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

export interface PayPalTransaction {
  id: string;
  date: string;
  time: string;
  timeZone: string;
  description: string;
  type: string;
  status: string;
  currency: string;
  gross: number;
  fee: number;
  net: number;
  from: string;
  to: string;
  referenceTxnId: string;
  receiptId: string;
  addressStatus: string;
  salesTax: string;
  invoiceNumber: string;
  balance: number;
  contactPhoneNumber: string;
  subject: string;
  note: string;
  balanceImpact: string;
}

function paypalIsoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function toPayPalSheetDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

export async function listPayPalTransactions(sinceMs = 0, pageSize = 100): Promise<PayPalTransaction[]> {
  if (!isPayPalConfigured()) return [];
  const end = new Date();
  const start = sinceMs > 0 ? new Date(sinceMs) : new Date(end.getTime() - 31 * 86_400_000);
  const params = new URLSearchParams({
    start_date: `${paypalIsoDate(start)}T00:00:00Z`,
    end_date: `${paypalIsoDate(end)}T23:59:59Z`,
    fields: "all",
    page_size: String(Math.min(pageSize, 500)),
  });
  const data = (await paypalGet(`/v1/reporting/transactions?${params}`)) as {
    transaction_details?: Array<{ transaction_info?: Record<string, unknown>; payer_info?: Record<string, unknown>; shipping_info?: Record<string, unknown>; cart_info?: Record<string, unknown> }>;
  };
  return (data.transaction_details ?? []).map(mapPayPalTransaction).filter((t): t is PayPalTransaction => Boolean(t));
}

function mapPayPalTransaction(raw: {
  transaction_info?: Record<string, unknown>;
  payer_info?: Record<string, unknown>;
  cart_info?: Record<string, unknown>;
}): PayPalTransaction | null {
  const info = raw.transaction_info ?? {};
  const id = String(info.transaction_id ?? "").trim();
  if (!id) return null;
  const init = String(info.transaction_initiation_date ?? "");
  const updated = String(info.transaction_updated_date ?? init);
  const dt = updated || init;
  const datePart = dt.slice(0, 10);
  const timePart = dt.length >= 19 ? dt.slice(11, 19) : "";
  const timeZone = dt.includes("T") ? "UTC" : "";
  const gross = moneyValue(info.transaction_amount as { value?: string });
  const fee = moneyValue(info.fee_amount as { value?: string });
  const net = moneyValue((info as { transaction_amount?: { value?: string }; fee_amount?: { value?: string }; net_amount?: { value?: string } }).net_amount as { value?: string })
    || (gross + fee);
  const cart = raw.cart_info as { item_details?: Array<{ item_description?: string; invoice_number?: string }> } | undefined;
  const invoiceNumber = cart?.item_details?.[0]?.invoice_number ?? "";
  const note = String(info.transaction_note ?? cart?.item_details?.[0]?.item_description ?? "").trim();
  return {
    id,
    date: toPayPalSheetDate(datePart),
    time: timePart,
    timeZone,
    description: String(info.transaction_subject ?? note ?? info.paypal_reference_id ?? "").trim(),
    type: String(info.transaction_event_code ?? info.transaction_status ?? "").trim(),
    status: String(info.transaction_status ?? "").trim(),
    currency: String((info.transaction_amount as { currency_code?: string } | undefined)?.currency_code ?? "USD").toUpperCase(),
    gross,
    fee,
    net: moneyValue(info.transaction_amount as { value?: string }) - Math.abs(fee),
    from: String((raw.payer_info as { email_address?: string } | undefined)?.email_address ?? info.paypal_account_id ?? "").trim(),
    to: String(info.paypal_reference_id ?? "").trim(),
    referenceTxnId: String(info.paypal_reference_id ?? info.bank_reference_id ?? "").trim(),
    receiptId: String(info.receipt_id ?? "").trim(),
    addressStatus: String((raw.payer_info as { address_status?: string } | undefined)?.address_status ?? "").trim(),
    salesTax: String(moneyValue(info.sales_tax_amount as { value?: string }) || ""),
    invoiceNumber,
    balance: moneyValue(info.ending_balance as { value?: string }),
    contactPhoneNumber: String((raw.payer_info as { phone_number?: { national_number?: string } } | undefined)?.phone_number?.national_number ?? "").trim(),
    subject: String(info.transaction_subject ?? "").trim(),
    note,
    balanceImpact: gross >= 0 ? "Credit" : "Debit",
  };
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
