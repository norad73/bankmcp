import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
export type AirwallexCurrency = "USD" | "EUR";

interface AirwallexSyncStore {
  transactionIds: string[];
  updatedAt?: string;
}

const FILES: Record<AirwallexCurrency, string> = {
  USD: "airwallex-usd-sync.json",
  EUR: "airwallex-eur-sync.json",
};

function path(currency: AirwallexCurrency): string {
  return join(config.dataDir, FILES[currency]);
}

function readStore(currency: AirwallexCurrency): AirwallexSyncStore {
  const file = path(currency);
  if (!existsSync(file)) return { transactionIds: [] };
  try {
    return JSON.parse(readFileSync(file, "utf8")) as AirwallexSyncStore;
  } catch {
    return { transactionIds: [] };
  }
}

export function loadAirwallexTransactionIds(currency: AirwallexCurrency): Set<string> {
  return new Set(readStore(currency).transactionIds);
}

export function rememberAirwallexTransactionIds(currency: AirwallexCurrency, ids: string[]): void {
  if (!ids.length) return;
  const store = readStore(currency);
  const set = new Set(store.transactionIds);
  for (const id of ids) set.add(id);
  writeFileSync(path(currency), JSON.stringify({ transactionIds: [...set], updatedAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
}
