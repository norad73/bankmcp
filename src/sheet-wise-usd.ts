export const WISE_USD_YELLOW_HEADERS = {
  transferWiseId: "TransferWise ID",
  wiseDate: "Wise Date",
  wiseDatetime: "Wise Datetime",
  wiseAmount: "Wise Amount",
  currency: "Currency",
  description: "Description",
  paymentReference: "Payment Reference",
  runningBalance: "Running Balance",
  exchangeFrom: "Exchange From",
  exchangeTo: "Exchange To",
  exchangeRate: "Exchange Rate",
  payerName: "Payer Name",
  payeeName: "Payee Name",
  payeeAccountNumber: "Payee Account Number",
  merchant: "Merchant",
  totalFees: "Total fees",
  exchangeToAmount: "Exchange To Amount",
  transactionType: "Transaction Type",
  transactionDetailsType: "Transaction Details Type",
} as const;

export interface WiseUsdSheetTransaction {
  id: string;
  transferWiseId: string;
  wiseDate: string;
  wiseDatetime: string;
  wiseAmount: number;
  currency: string;
  description: string;
  paymentReference: string;
  runningBalance?: number;
  exchangeFrom: string;
  exchangeTo: string;
  exchangeRate: string;
  payerName: string;
  payeeName: string;
  payeeAccountNumber: string;
  merchant: string;
  totalFees: number;
  exchangeToAmount: string;
  transactionType: string;
  transactionDetailsType: string;
}

export function wiseUsdRowValues(tx: WiseUsdSheetTransaction): Record<keyof typeof WISE_USD_YELLOW_HEADERS, string | number> {
  return {
    transferWiseId: tx.transferWiseId,
    wiseDate: tx.wiseDate,
    wiseDatetime: tx.wiseDatetime,
    wiseAmount: tx.wiseAmount,
    currency: tx.currency,
    description: tx.description,
    paymentReference: tx.paymentReference,
    runningBalance: tx.runningBalance ?? "",
    exchangeFrom: tx.exchangeFrom,
    exchangeTo: tx.exchangeTo,
    exchangeRate: tx.exchangeRate,
    payerName: tx.payerName,
    payeeName: tx.payeeName,
    payeeAccountNumber: tx.payeeAccountNumber,
    merchant: tx.merchant,
    totalFees: tx.totalFees,
    exchangeToAmount: tx.exchangeToAmount,
    transactionType: tx.transactionType,
    transactionDetailsType: tx.transactionDetailsType,
  };
}
