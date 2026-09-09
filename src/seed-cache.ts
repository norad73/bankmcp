import { getCachedBalance, seedBalanceCache, type SeedBalanceCacheInput, type SeedBalanceCacheResult } from "./balance-cache.ts";
import { accountDisplayName, isoDate, sessionName } from "./data.ts";
import { store } from "./store.ts";

const MANUAL_BALANCE_SEEDS: Array<{ until: string; sessionLabel: string; available: number; currency: string }> = [
  { until: "2026-09-09", sessionLabel: "Eurobank IKE", available: 9844.24, currency: "EUR" },
];

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

export function applyManualBalanceSeeds(): void {
  const today = isoDate();
  for (const seed of MANUAL_BALANCE_SEEDS) {
    if (today > seed.until) continue;
    try {
      const accounts = accountsForSessionLabel(seed.sessionLabel);
      if (accounts.some((account) => getCachedBalance(account.uid, today))) continue;
      const seeded = seedBalanceCacheForLabel({
        sessionLabel: seed.sessionLabel,
        available: seed.available,
        booked: seed.available,
        currency: seed.currency,
        date: today,
      });
      console.log(`[bank] seeded balance cache for ${seed.sessionLabel} (${seeded.map((row) => row.account).join(", ")}): ${seed.available} ${seed.currency}`);
    } catch (err) {
      console.log(`[bank] balance seed skipped for ${seed.sessionLabel}: ${(err as Error).message}`);
    }
  }
}
