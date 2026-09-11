import { syncEurobankTransactionsToSheet } from "./sync-enablebanking-transactions.ts";

export async function syncEurobankBranchTransactionsToSheet(sinceMs: number, knownIds: string[]) {
  return syncEurobankTransactionsToSheet(
    {
      sessionLabel: "Eurobank USA Branch",
      webhookAction: "fill-eurobank",
      skipReason: "No new Eurobank transactions",
    },
    sinceMs,
    knownIds,
  );
}
