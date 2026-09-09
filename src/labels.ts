// Apply known display names to stored bank sessions on startup.
import { store, type StoredSession } from "./store.ts";
import { isWiseConfigured } from "./wise.ts";

const KNOWN_LABELS: Array<{ bank: string; label: string; when?: (sessions: StoredSession[]) => boolean }> = [
  {
    bank: "Eurobank",
    label: "Eurobank IKE",
    when: (sessions) => sessions.filter((s) => s.bank.name === "Eurobank" && !s.label).length === 1,
  },
];

export function purgeEbWiseWhenApiConfigured(): void {
  if (!isWiseConfigured()) return;
  const s = store();
  for (const session of s.sessions()) {
    if (session.bank.name.toLowerCase() !== "wise") continue;
    s.removeSession(session.id);
    console.log(`[bank] removed Enable Banking Wise session ${session.id} (Wise API token configured)`);
  }
}

export function applyKnownSessionLabels(): void {
  const s = store();
  const sessions = s.sessions();
  for (const rule of KNOWN_LABELS) {
    const matches = sessions.filter((session) => session.bank.name === rule.bank && !session.label);
    if (!matches.length) continue;
    if (rule.when && !rule.when(sessions)) continue;
    for (const session of matches) {
      s.setSessionLabel(session.id, rule.label);
      console.log(`[bank] labelled ${rule.bank} session ${session.id} as ${rule.label}`);
    }
  }
}
