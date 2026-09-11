/** Yellow import columns on Airwallex USD/EUR tabs (B–U). */
export const AIRWALLEX_YELLOW_HEADERS = {
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

export type AirwallexYellowField = keyof typeof AIRWALLEX_YELLOW_HEADERS;

export interface AirwallexSheetRow {
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

export function airwallexRowValues(row: AirwallexSheetRow): Record<AirwallexYellowField, string | number> {
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

/** @deprecated Use AIRWALLEX_YELLOW_HEADERS */
export const AIRWALLEX_USD_YELLOW_HEADERS = AIRWALLEX_YELLOW_HEADERS;
/** @deprecated Use AirwallexSheetRow */
export type AirwallexUsdSheetRow = AirwallexSheetRow;
/** @deprecated Use AirwallexYellowField */
export type AirwallexUsdYellowField = AirwallexYellowField;
/** @deprecated Use airwallexRowValues */
export const airwallexUsdRowValues = airwallexRowValues;
