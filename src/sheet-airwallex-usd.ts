/** Yellow import columns on the Airwallex USD tab (B–U). */
export const AIRWALLEX_USD_YELLOW_HEADERS = {
  time: "Time",
  type: "Type",
  financialTransactionType: "Financial Transaction Type",
  transactionId: "Transaction Id",
  description: "Description",
  walletCurrency: "Wallet Currency",
  targetCurrency: "Target Currency",
  targetAmount: "Target Amount",
  conversionRate: "Conversion Rate",
  matureDate: "Mature Date",
  amount: "Amount",
  fee: "Fee",
  debitNetAmount: "Debit Net Amount",
  creditNetAmount: "Credit Net Amount",
  availableBalance: "Available Balance",
  accountBalance: "Account Balance",
  createdAt: "Created At",
  requestId: "Request Id",
  reference: "Reference",
  noteToSelf: "Note to Self",
} as const;

export type AirwallexUsdYellowField = keyof typeof AIRWALLEX_USD_YELLOW_HEADERS;

export interface AirwallexUsdSheetRow {
  transactionId: string;
  time: string;
  type: string;
  financialTransactionType: string;
  description: string;
  walletCurrency: string;
  targetCurrency: string;
  targetAmount: string | number;
  conversionRate: string | number;
  matureDate: string;
  amount: string | number;
  fee: string | number;
  debitNetAmount: string | number;
  creditNetAmount: string | number;
  availableBalance: string | number;
  accountBalance: string | number;
  createdAt: string;
  requestId: string;
  reference: string;
  noteToSelf: string;
}

export function airwallexUsdRowValues(row: AirwallexUsdSheetRow): Record<AirwallexUsdYellowField, string | number> {
  return {
    time: row.time,
    type: row.type,
    financialTransactionType: row.financialTransactionType,
    transactionId: row.transactionId,
    description: row.description,
    walletCurrency: row.walletCurrency,
    targetCurrency: row.targetCurrency,
    targetAmount: row.targetAmount,
    conversionRate: row.conversionRate,
    matureDate: row.matureDate,
    amount: row.amount,
    fee: row.fee,
    debitNetAmount: row.debitNetAmount,
    creditNetAmount: row.creditNetAmount,
    availableBalance: row.availableBalance,
    accountBalance: row.accountBalance,
    createdAt: row.createdAt,
    requestId: row.requestId,
    reference: row.reference,
    noteToSelf: row.noteToSelf,
  };
}
