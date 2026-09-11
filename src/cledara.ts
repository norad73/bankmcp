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

const CLEDARA_FETCH_MS = 20_000;

export function isCledaraConfigured(): boolean {
  return Boolean(config.cledaraApiToken);
}

async function cledaraGet(path: string): Promise<unknown> {
  const res = await fetch(`${config.cledaraApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.cledaraApiToken}`,
    },
    signal: AbortSignal.timeout(CLEDARA_FETCH_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new CledaraError(res.status, text);
  return text ? JSON.parse(text) : {};
}

export async function listCledaraTransactions(opts: {
  from?: string;
  to?: string;
  maxResults?: number;
} = {}): Promise<CledaraTransaction[]> {
  if (!isCledaraConfigured()) return [];
  const maxResults = opts.maxResults ?? 300;
  const out: CledaraTransaction[] = [];
  let offset = 0;

  while (out.length < maxResults) {
    const params = new URLSearchParams();
    if (opts.from) params.set("from", opts.from);
    if (opts.to) params.set("to", opts.to);
    if (offset > 0) params.set("offset", String(offset));
    const suffix = params.toString() ? `?${params}` : "";
    const data = (await cledaraGet(`/v0/transactions${suffix}`)) as {
      transactions?: Array<Record<string, unknown>>;
      nextOffset?: number | null;
      hasMore?: boolean;
    };
    const page = (data.transactions ?? [])
      .map(normalizeCledaraTransaction)
      .filter((t): t is CledaraTransaction => Boolean(t));
    if (!page.length) break;
    out.push(...page);
    if (!data.hasMore || data.nextOffset == null) break;
    offset = data.nextOffset;
  }

  return out.slice(0, maxResults);
}

function normalizeCledaraTransaction(raw: Record<string, unknown>): CledaraTransaction | null {
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const amount = Number(raw.amount ?? raw.localAmount);
  if (!Number.isFinite(amount)) return null;
  const application = raw.application as { name?: string } | undefined;
  const card = raw.card as { number?: string; name?: string } | undefined;
  const parts = [
    card?.name,
    application?.name,
    raw.description,
    card?.number ? `#${card.number}` : undefined,
  ].filter(Boolean);
  return {
    id,
    amount,
    currency: String(raw.currency ?? raw.localCurrency ?? "USD").toUpperCase(),
    description: parts.join(", ") || String(raw.description ?? ""),
    settledAt: typeof raw.settledAt === "string" ? raw.settledAt : undefined,
    createdAt: typeof raw.authorizedAt === "string" ? raw.authorizedAt : typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    status: typeof raw.type === "string" ? raw.type : undefined,
  };
}
