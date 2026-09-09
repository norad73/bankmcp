// Daily balance cache — keyed by account uid + Athens calendar date.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { athensDate } from "./data.ts";

export interface CachedBalance {
  date: string;
  fetchedAt: string;
  booked?: number;
  available?: number;
  currency?: string;
}

interface BalanceCacheData {
  version: 1;
  accounts: Record<string, CachedBalance>;
}

const path = () => join(config.dataDir, "balance-cache.json");

function empty(): BalanceCacheData {
  return { version: 1, accounts: {} };
}

function load(): BalanceCacheData {
  const file = path();
  if (!existsSync(file)) return empty();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<BalanceCacheData>;
    return { version: 1, accounts: parsed.accounts ?? {} };
  } catch {
    return empty();
  }
}

function save(data: BalanceCacheData): void {
  mkdirSync(config.dataDir, { recursive: true });
  const file = path();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}

export function getCachedBalance(accountUid: string, date = athensDate()): CachedBalance | undefined {
  const entry = load().accounts[accountUid];
  return entry?.date === date ? entry : undefined;
}

export function setCachedBalance(accountUid: string, input: Omit<CachedBalance, "date" | "fetchedAt"> & { date?: string; fetchedAt?: string }): void {
  const data = load();
  data.accounts[accountUid] = {
    date: input.date ?? athensDate(),
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    booked: input.booked,
    available: input.available,
    currency: input.currency,
  };
  save(data);
}

export interface SeedBalanceCacheInput {
  sessionLabel: string;
  available: number;
  booked?: number;
  currency?: string;
  account?: string;
  accountUid?: string;
  date?: string;
}

export interface SeedBalanceCacheResult {
  accountUid: string;
  account: string;
}

export function seedBalanceCache(
  findAccounts: () => Array<{ uid: string; displayName: string; currency: string }>,
  input: SeedBalanceCacheInput,
): SeedBalanceCacheResult[] {
  const date = input.date ?? athensDate();
  const currency = input.currency ?? "EUR";
  const booked = input.booked ?? input.available;
  let accounts = findAccounts();

  if (input.accountUid) {
    accounts = accounts.filter((a) => a.uid === input.accountUid);
  } else if (input.account) {
    const needle = input.account.toLowerCase();
    accounts = accounts.filter((a) => a.displayName.toLowerCase().includes(needle));
  } else if (accounts.length > 1) {
    const primary = accounts.filter((a) => !/^\d+$/.test(a.displayName.trim()));
    if (primary.length === 1) accounts = primary;
  }

  if (!accounts.length) throw new Error("No matching account found to seed");
  if (accounts.length > 1) {
    throw new Error(`Multiple accounts match (${accounts.map((a) => a.displayName).join(", ")}); pass --account or --uid`);
  }

  const account = accounts[0]!;
  setCachedBalance(account.uid, {
    date,
    booked,
    available: input.available,
    currency: input.currency ?? account.currency ?? currency,
  });
  return [{ accountUid: account.uid, account: account.displayName }];
}
