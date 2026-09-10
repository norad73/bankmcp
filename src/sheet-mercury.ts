/** One row of yellow import columns on the Mercury tab. */
export interface MercurySheetTransaction {
  id: string;
  dateUtc: string;
  description: string;
  amount: number;
  status: string;
  sourceAccount: string;
  bankDescription: string;
  reference: string;
  note: string;
  nameOnCard: string;
  category: string;
  glCode: string;
}

/** Yellow import headers on the Mercury tab (do not fill green/formula columns). */
export const MERCURY_YELLOW_HEADERS = {
  dateUtc: "Date (UTC)",
  description: "Description",
  amount: "Amount",
  status: "Status",
  sourceAccount: "Source Account",
  bankDescription: "Bank Description",
  reference: "Reference",
  note: "Note",
  nameOnCard: "Name On Card",
  category: "Category",
  glCode: "GL Code",
} as const;

export type MercuryYellowField = keyof typeof MERCURY_YELLOW_HEADERS;

export function mercuryRowValues(tx: MercurySheetTransaction): Record<MercuryYellowField, string | number> {
  return {
    dateUtc: tx.dateUtc,
    description: tx.description,
    amount: tx.amount,
    status: tx.status,
    sourceAccount: tx.sourceAccount,
    bankDescription: tx.bankDescription,
    reference: tx.reference,
    note: tx.note,
    nameOnCard: tx.nameOnCard,
    category: tx.category,
    glCode: tx.glCode,
  };
}
