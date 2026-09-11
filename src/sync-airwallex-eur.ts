export {
  affectsAirwallexAccountBalance,
  airwallexBalanceDelta,
  filterNewAirwallexRows as filterNewAirwallexEurRows,
  parseBalanceActivityCsv,
  validatesAirwallexBalanceChain,
} from "./sync-airwallex.ts";

import {
  fetchNewAirwallexTransactions,
  syncAirwallexTransactionsToSheet,
  type AirwallexSheetRow,
} from "./sync-airwallex.ts";

export type { AirwallexSheetRow as AirwallexEurSheetRow };

export function fetchNewAirwallexEurTransactions(
  sinceMs = 0,
  sheetTransactionIds?: string[],
  anchorAccountBalance?: number,
): Promise<AirwallexSheetRow[]> {
  return fetchNewAirwallexTransactions("EUR", sinceMs, sheetTransactionIds, anchorAccountBalance);
}

export function syncAirwallexEurTransactionsToSheet(
  sinceMs = 0,
  sheetTransactionIds?: string[],
  anchorAccountBalance?: number,
): Promise<{ transactions: AirwallexSheetRow[]; sheet: Record<string, unknown> }> {
  return syncAirwallexTransactionsToSheet("EUR", sinceMs, sheetTransactionIds, anchorAccountBalance);
}
