// Apply known display names to stored bank sessions on startup.
import { store, type StoredSession } from "./store.ts";

const KNOWN_LABELS: Array<{ bank: string; label: string; when?: (sessions: StoredSession[]) => boolean }> = [
  {
    bank: "Eurobank",
    label: "Eurobank IKE",
    when: (sessions) => sessions.filter((s) => s.bank.name === "Eurobank" && !s.label).length === 1,
  },
];

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
