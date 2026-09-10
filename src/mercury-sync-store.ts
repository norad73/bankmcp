import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";

interface MercurySyncStore {
  transactionIds: string[];
  updatedAt?: string;
}

const FILE = "mercury-sync.json";

function path(): string {
  return join(config.dataDir, FILE);
}

function readStore(): MercurySyncStore {
  const file = path();
  if (!existsSync(file)) return { transactionIds: [] };
  try {
    return JSON.parse(readFileSync(file, "utf8")) as MercurySyncStore;
  } catch {
    return { transactionIds: [] };
  }
}

export function hasMercuryTransactionId(id: string): boolean {
  return readStore().transactionIds.includes(id);
}

export function rememberMercuryTransactionIds(ids: string[]): void {
  if (!ids.length) return;
  const store = readStore();
  const set = new Set(store.transactionIds);
  for (const id of ids) set.add(id);
  writeFileSync(path(), JSON.stringify({ transactionIds: [...set], updatedAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
}
