import { createHash } from "node:crypto";

/** Match Apps Script UNIQUE_ID(cell1, cell2, cell3, length). */
export function uniqueId(parts: unknown[], length = 12): string {
  const content = parts.map((cell) => (cell === undefined || cell === null ? "" : String(cell))).join("");
  return createHash("md5").update(content).digest("hex").slice(0, length);
}
