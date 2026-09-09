import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSheetBalanceColumns } from "../src/sheet-balances.ts";
import type { BalanceRow } from "../src/sync-sheets.ts";

const fx = { date: "2026-09-08", toUsd: { EUR: 1.1, USD: 1 } };

const rows: BalanceRow[] = [
  { date: "2026-09-09", source: "stripe", account: "Stripe available", uid: "s1", currency: "USD", available: 100 },
  { date: "2026-09-09", source: "viva", account: "Viva A", uid: "v1", currency: "EUR", available: 100 },
  { date: "2026-09-09", source: "enablebanking", bank: "Eurobank USA Branch", account: "Eurobank USA Branch", uid: "e1", currency: "EUR", available: 1494.3 },
  { date: "2026-09-09", source: "enablebanking", bank: "Eurobank IKE", account: "02", uid: "e2", currency: "EUR", available: 9844.24 },
];

test("buildSheetBalanceColumns maps sources to sheet columns in USD", () => {
  const cols = buildSheetBalanceColumns(rows, fx);
  assert.equal(cols.stripe, 100);
  assert.equal(cols.viva, 110);
  assert.equal(cols.eurobank, 1644);
  assert.equal(cols.eurobankIke, 10829);
});
