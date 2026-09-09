// Read-only client for Mercury account balances.
// https://docs.mercury.com/reference/getaccounts
import { config } from "./config.ts";

export interface MercuryAccount {
  id: string;
  name: string;
  nickname?: string | null;
  availableBalance: number;
  currentBalance: number;
  status: string;
  type: string;
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
