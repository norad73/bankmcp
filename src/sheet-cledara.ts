export const CLEDARA_YELLOW_HEADERS = {
  origDate: "origDate",
  description: "Description",
  amount: "Amount",
  direction: "Direction",
} as const;

export interface CledaraSheetTransaction {
  id: string;
  origDate: string;
  description: string;
  amount: number;
  direction: "IN" | "OUT";
}

export function cledaraRowValues(tx: CledaraSheetTransaction): Record<keyof typeof CLEDARA_YELLOW_HEADERS, string | number> {
  return {
    origDate: tx.origDate,
    description: tx.description,
    amount: tx.amount,
    direction: tx.direction,
  };
}
