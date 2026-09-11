export const WISE_EUR_YELLOW_HEADERS = {
  transferWiseId: "TransferWise ID",
  originalDate: "Original Date",
  dateTime: "Date Time",
  originalAmount: "Original Amount",
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
  sheetExchangeRate: "Exchange rate",
} as const;

export interface WiseEurSheetTransaction {
  id: string;
  transferWiseId: string;
  originalDate: string;
  dateTime: string;
  originalAmount: number;
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
  sheetExchangeRate: string;
}

export function wiseEurRowValues(tx: WiseEurSheetTransaction): Record<keyof typeof WISE_EUR_YELLOW_HEADERS, string | number> {
  return {
    transferWiseId: tx.transferWiseId,
    originalDate: tx.originalDate,
    dateTime: tx.dateTime,
    originalAmount: tx.originalAmount,
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
    sheetExchangeRate: tx.sheetExchangeRate,
  };
}
