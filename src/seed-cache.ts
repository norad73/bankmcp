import { seedBalanceCache, type SeedBalanceCacheInput, type SeedBalanceCacheResult } from "./balance-cache.ts";
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
