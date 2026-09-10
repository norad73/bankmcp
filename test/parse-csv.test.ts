import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv } from "../src/parse-csv.ts";
import { parseBalanceActivityCsv } from "../src/sync-airwallex-usd.ts";

test("parseCsv handles quoted commas", () => {
  const rows = parseCsv('a,"b,c",d\n1,2,3');
  assert.deepEqual(rows, [
    ["a", "b,c", "d"],
    ["1", "2", "3"],
  ]);
});

test("parseBalanceActivityCsv maps BAR columns to sheet row", () => {
  const csv = [
    "Time,Type,Financial Transaction Type,Transaction Id,Description,Wallet Currency,Target Currency,Target Amount,Conversion Rate,Mature Date,Amount,Fee,Debit Net Amount,Credit Net Amount,Account Balance,Available Balance,Created At,Request Id,Reference,Note to Self",
    '2026-08-25T00:30:33-0700,CARD,CARD_AUTHORISATION,038cb69e-945a-4a88-8acd-40c949c0a11a,"SHOP, GRC",USD,EUR,22.28,,,211.68,,211.68,,"6,470.11","6,258.43",2026-08-25T00:30:32-0700,,,',
  ].join("\n");
  const rows = parseBalanceActivityCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.transactionId, "038cb69e-945a-4a88-8acd-40c949c0a11a");
  assert.equal(rows[0]?.description, "SHOP, GRC");
  assert.equal(rows[0]?.availableBalance, 6258.43);
  assert.equal(rows[0]?.accountBalance, 6470.11);
});
