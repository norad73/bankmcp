import { config } from "./config.ts";

export interface CledaraTransaction {
  id: string;
  amount: number;
  currency: string;
  description: string;
  settledAt?: string;
  createdAt?: string;
  status?: string;
}

export class CledaraError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Cledara API ${status}: ${body.slice(0, 300)}`);
    this.name = "CledaraError";
    this.status = status;
    this.body = body;
  }
}

export function isCledaraConfigured(): boolean {
  return Boolean(config.cledaraApiToken);
}

async function cledaraGet(path: string): Promise<unknown> {
  const res = await fetch(`${config.cledaraApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.cledaraApiToken}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new CledaraError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export async function listCledaraTransactions(opts: { from?: string; limit?: number } = {}): Promise<CledaraTransaction[]> {
  if (!isCledaraConfigured()) return [];
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.limit) params.set("limit", String(opts.limit));
  const suffix = params.toString() ? `?${params}` : "";
  const data = (await cledaraGet(`/v0/transactions${suffix}`)) as {
    transactions?: Array<Record<string, unknown>>;
  };
  return (data.transactions ?? []).map(normalizeCledaraTransaction).filter((t): t is CledaraTransaction => Boolean(t));
}

function normalizeCledaraTransaction(raw: Record<string, unknown>): CledaraTransaction | null {
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const amount = Number(raw.amount ?? raw.localAmount);
  if (!Number.isFinite(amount)) return null;
  const application = raw.application as { name?: string } | undefined;
  const merchant = raw.merchant as { name?: string } | undefined;
  const card = raw.card as { lastFour?: string } | undefined;
  const parts = [
    merchant?.name,
    application?.name,
    raw.description,
    card?.lastFour ? `#${card.lastFour}` : undefined,
  ].filter(Boolean);
  return {
    id,
    amount,
    currency: String(raw.currency ?? raw.localCurrency ?? "USD").toUpperCase(),
    description: parts.join(", ") || String(raw.description ?? ""),
    settledAt: typeof raw.settledAt === "string" ? raw.settledAt : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  };
}
