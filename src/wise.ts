// Read-only client for Wise balance accounts via personal API token.
// https://docs.wise.com/api-reference/balance
import { config } from "./config.ts";

export interface WiseBalance {
  id: number;
  currency: string;
  available: number;
  name?: string;
}

export class WiseError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Wise API ${status}: ${body.slice(0, 300)}`);
    this.name = "WiseError";
    this.status = status;
    this.body = body;
  }
}

interface WiseProfile {
  id: number;
  type: string;
  details?: { name?: string; firstName?: string; lastName?: string };
}

interface WiseBalanceResponse {
  id: number;
  currency: string;
  amount?: { value?: number | string };
  cashAmount?: { value?: number | string };
  name?: string | null;
}

export function isWiseConfigured(): boolean {
  return Boolean(config.wiseApiToken);
}

async function wiseGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.wiseApiBase}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${config.wiseApiToken}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new WiseError(res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}

async function resolveProfileId(): Promise<{ id: number; label: string }> {
  if (config.wiseProfileId) {
    return { id: Number(config.wiseProfileId), label: config.wiseAccountLabel || "Wise" };
  }
  const profiles = await wiseGet<WiseProfile[]>("/v1/profiles");
  const business = profiles.find((p) => p.type === "business");
  const profile = business ?? profiles[0];
  if (!profile) throw new WiseError(404, "No Wise profile found");
  const label = profile.details?.name
    ?? ([profile.details?.firstName, profile.details?.lastName].filter(Boolean).join(" ") || "Wise");
  return { id: profile.id, label };
}

export async function listWiseBalances(): Promise<{ profileId: number; profileLabel: string; balances: WiseBalance[] }> {
  if (!isWiseConfigured()) return { profileId: 0, profileLabel: "Wise", balances: [] };
  const { id, label } = await resolveProfileId();
  const data = await wiseGet<WiseBalanceResponse[]>(`/v4/profiles/${id}/balances?types=STANDARD`);
  const balances = data.map((b) => ({
    id: b.id,
    currency: b.currency.toUpperCase(),
    available: Number(b.amount?.value ?? b.cashAmount?.value ?? 0),
    name: b.name?.trim() || undefined,
  }));
  return { profileId: id, profileLabel: label, balances };
}
