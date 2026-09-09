import { clearCachedBalance, getCachedBalance, seedBalanceCache, setCachedBalance, type SeedBalanceCacheInput, type SeedBalanceCacheResult } from "./balance-cache.ts";
import { accountDisplayName, athensDate, sessionName } from "./data.ts";
import { store } from "./store.ts";

export function emptySessionUid(sessionId: string): string {
  return `session:${sessionId}:empty`;
}

export function sessionsForLabel(label: string) {
  const needle = label.trim().toLowerCase();
  return store().sessions().filter((session) => sessionName(session).toLowerCase() === needle);
}

export function accountsForSessionLabel(label: string) {
  const sessions = sessionsForLabel(label);
  if (!sessions.length) throw new Error(`No session labeled "${label}"`);
  const s = store();
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
  const accounts = accountsForSessionLabel(input.sessionLabel);
  if (accounts.length) return seedBalanceCache(() => accounts, input);

  const sessions = sessionsForLabel(input.sessionLabel);
  const session = sessions[0]!;
  const uid = emptySessionUid(session.id);
  const date = input.date ?? athensDate();
  const currency = input.currency ?? "EUR";
  setCachedBalance(uid, {
    date,
    booked: input.booked ?? input.available,
    available: input.available,
    currency,
  });
  return [{ accountUid: uid, account: input.sessionLabel }];
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

/** Seed today's balance for Eurobank USA Branch when the bank returns no account UIDs. */
export function fixEurobankUsaBranchBalanceCache(amount = 1494.3): void {
  const label = "Eurobank USA Branch";
  try {
    const uid = sessionsForLabel(label).map((session) => emptySessionUid(session.id))[0];
    if (!uid) return;
    if (getCachedBalance(uid)?.available === amount) return;
    seedBalanceCacheForLabel({ sessionLabel: label, available: amount, booked: amount, currency: "EUR" });
    console.log(`[bank] cached ${amount} EUR on ${label}`);
  } catch (err) {
    console.log(`[bank] Eurobank USA Branch cache fix skipped: ${(err as Error).message}`);
  }
}
