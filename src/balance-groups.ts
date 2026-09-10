import type { FxRates } from "./fx.ts";
import { amountInUsd } from "./fx.ts";

export interface BalanceDisplayRow {
  uid: string;
  source: string;
  logo?: string;
  account: string;
  currency: string;
  booked?: number;
  available?: number;
  error?: string;
  cached?: boolean;
  fetchedAt?: string;
}

export interface BalanceGroup {
  key: string;
  source: string;
  logo?: string;
  accounts: BalanceDisplayRow[];
}

export function groupBalanceRows(rows: BalanceDisplayRow[]): BalanceGroup[] {
  const groups: BalanceGroup[] = [];
  const index = new Map<string, BalanceGroup>();
  for (const row of rows) {
    let group = index.get(row.source);
    if (!group) {
      group = { key: row.source, source: row.source, logo: row.logo, accounts: [] };
      index.set(row.source, group);
      groups.push(group);
    }
    group.accounts.push(row);
  }
  return groups;
}

export function rowAmount(r: BalanceDisplayRow): number | undefined {
  return r.available ?? r.booked;
}

export function groupAvailableSummary(accounts: BalanceDisplayRow[]): { currency: string; amount: number } | undefined {
  const byCurrency = new Map<string, number>();
  for (const account of accounts) {
    if (account.error) continue;
    const amount = rowAmount(account);
    if (amount === undefined) continue;
    byCurrency.set(account.currency, (byCurrency.get(account.currency) ?? 0) + amount);
  }
  if (byCurrency.size !== 1) return undefined;
  const [[currency, amount]] = byCurrency.entries();
  return { currency, amount };
}

export function groupUsdTotal(accounts: BalanceDisplayRow[], fx?: FxRates): number {
  let total = 0;
  for (const account of accounts) {
    if (account.error) continue;
    total += amountInUsd(rowAmount(account), account.currency, fx) ?? 0;
  }
  return total;
}

export function groupHasError(accounts: BalanceDisplayRow[]): boolean {
  return accounts.some((a) => a.error);
}

export function groupNonZeroCount(accounts: BalanceDisplayRow[]): number {
  return accounts.filter((a) => !a.error && (rowAmount(a) ?? 0) !== 0).length;
}
