import { clearCachedBalance, seedBalanceCache, type SeedBalanceCacheInput, type SeedBalanceCacheResult } from "./balance-cache.ts";
import { accountDisplayName, sessionName } from "./data.ts";
import { store } from "./store.ts";

export function accountsForSessionLabel(label: string) {
  const s = store();
  const sessions = s.sessions().filter((session) => sessionName(session).toLowerCase() === label.trim().toLowerCase());
  if (!sessions.length) throw new Error(`No session labeled "${label}"`);
  return sessions.flatMap((session) =>
    s.accounts()
      .filter((account) => account.session_id === session.id)
      .map((account) => ({
        uid: account.uid,
        displayName: accountDisplayName(account),
        currency: account.currency,
      })),
  );
}

export function seedBalanceCacheForLabel(input: SeedBalanceCacheInput): SeedBalanceCacheResult[] {
  return seedBalanceCache(() => accountsForSessionLabel(input.sessionLabel), input);
}

export function clearBalanceCacheForLabel(label: string, account?: string, accountUid?: string): SeedBalanceCacheResult[] {
  let accounts = accountsForSessionLabel(label);
  if (accountUid) accounts = accounts.filter((a) => a.uid === accountUid);
  else if (account) {
    const needle = account.toLowerCase();
    accounts = accounts.filter((a) => a.displayName.toLowerCase().includes(needle));
  }
  if (!accounts.length) throw new Error("No matching account found to clear");
  if (accounts.length > 1) {
    throw new Error(`Multiple accounts match (${accounts.map((a) => a.displayName).join(", ")}); pass --account or --uid`);
  }
  const row = accounts[0]!;
  clearCachedBalance(row.uid);
  return [{ accountUid: row.uid, account: row.displayName }];
}
