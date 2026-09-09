import { clearCachedBalance, getCachedBalance, seedBalanceCache, type SeedBalanceCacheInput, type SeedBalanceCacheResult } from "./balance-cache.ts";
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

/** Move today's Eurobank IKE balance cache onto account 02 if it landed elsewhere. */
export function fixEurobankIkeBalanceCache(amount = 9844.24): void {
  const label = "Eurobank IKE";
  try {
    const accounts = accountsForSessionLabel(label);
    const acct02 = accounts.find((a) => a.displayName.trim() === "02");
    if (!acct02) return;

    for (const account of accounts) {
      if (account.uid === acct02.uid) continue;
      const cached = getCachedBalance(account.uid);
      if (cached && cached.available === amount) clearCachedBalance(account.uid);
    }

    if (getCachedBalance(acct02.uid)?.available !== amount) {
      seedBalanceCacheForLabel({ sessionLabel: label, available: amount, booked: amount, currency: "EUR", account: "02" });
      console.log(`[bank] cached ${amount} EUR on ${label} / 02`);
    }
  } catch (err) {
    console.log(`[bank] Eurobank IKE cache fix skipped: ${(err as Error).message}`);
  }
}
