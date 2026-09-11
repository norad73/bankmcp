export const PAYPAL_YELLOW_HEADERS = {
  date: "Date",
  time: "Time",
  timeZone: "TimeZone",
  description: "Description",
  type: "Type",
  status: "Status",
  currency: "Currency",
  gross: "Gross",
  fee: "Fee",
  net: "Net",
  from: "From",
  to: "To",
  transactionId: "Transaction ID",
  referenceTxnId: "Reference Txn ID",
  receiptId: "Receipt ID",
  addressStatus: "Address Status",
  salesTax: "Sales Tax",
  invoiceNumber: "Invoice Number",
  balance: "Balance",
  contactPhoneNumber: "Contact Phone Number",
  subject: "Subject",
  note: "Note",
  balanceImpact: "Balance Impact",
} as const;

export interface PayPalSheetTransaction {
  id: string;
  date: string;
  time: string;
  timeZone: string;
  description: string;
  type: string;
  status: string;
  currency: string;
  gross: number;
  fee: number;
  net: number;
  from: string;
  to: string;
  transactionId: string;
  referenceTxnId: string;
  receiptId: string;
  addressStatus: string;
  salesTax: string;
  invoiceNumber: string;
  balance: number;
  contactPhoneNumber: string;
  subject: string;
  note: string;
  balanceImpact: string;
}

export function paypalRowValues(tx: PayPalSheetTransaction): Record<keyof typeof PAYPAL_YELLOW_HEADERS, string | number> {
  return {
    date: tx.date,
    time: tx.time,
    timeZone: tx.timeZone,
    description: tx.description,
    type: tx.type,
    status: tx.status,
    currency: tx.currency,
    gross: tx.gross,
    fee: tx.fee,
    net: tx.net,
    from: tx.from,
    to: tx.to,
    transactionId: tx.transactionId,
    referenceTxnId: tx.referenceTxnId,
    receiptId: tx.receiptId,
    addressStatus: tx.addressStatus,
    salesTax: tx.salesTax,
    invoiceNumber: tx.invoiceNumber,
    balance: tx.balance,
    contactPhoneNumber: tx.contactPhoneNumber,
    subject: tx.subject,
    note: tx.note,
    balanceImpact: tx.balanceImpact,
  };
}
