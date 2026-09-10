import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv } from "../src/parse-csv.ts";
import {
  affectsAirwallexAccountBalance,
  airwallexBalanceDelta,
  filterNewAirwallexUsdRows,
  parseBalanceActivityCsv,
  validatesAirwallexBalanceChain,
  type AirwallexUsdSheetRow,
} from "../src/sync-airwallex-usd.ts";

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

test("affectsAirwallexAccountBalance excludes reservation holds and releases", () => {
  assert.equal(affectsAirwallexAccountBalance({ financialTransactionType: "CARD_PURCHASE" }), true);
  assert.equal(affectsAirwallexAccountBalance({ financialTransactionType: "CARD_AUTHORISATION" }), false);
  assert.equal(affectsAirwallexAccountBalance({ financialTransactionType: "CARD_AUTHORISATION_RELEASE" }), false);
  assert.equal(affectsAirwallexAccountBalance({ financialTransactionType: "PAYMENT_RESERVE_HOLD" }), false);
});

test("filterNewAirwallexUsdRows skips only ids still on the sheet", () => {
  const row = (id: string, type: string): AirwallexUsdSheetRow => ({
    transactionId: id,
    time: "2026-09-01T12:00:00-0700",
    type: "CARD",
    financialTransactionType: type,
    description: "",
    walletCurrency: "USD",
    targetCurrency: "",
    targetAmount: "",
    conversionRate: "",
    matureDate: "",
    amount: 10,
    fee: "",
    debitNetAmount: 10,
    creditNetAmount: "",
    availableBalance: 100,
    accountBalance: 100,
    createdAt: "2026-09-01T12:00:00-0700",
    requestId: "",
    reference: "",
    noteToSelf: "",
  });
  const rows = [row("keep-me", "CARD_PURCHASE"), row("re-add-me", "CARD_PURCHASE")];
  const filtered = filterNewAirwallexUsdRows(rows, new Set(["keep-me"]), 0);
  assert.deepEqual(filtered.map((r) => r.transactionId), ["re-add-me"]);
});

test("filterNewAirwallexUsdRows preserves BAR row order for same-day transactions", () => {
  const row = (id: string, accountBalance: number): AirwallexUsdSheetRow => ({
    transactionId: id,
    time: "2026-09-01T12:00:00-0700",
    type: "CARD",
    financialTransactionType: "CARD_PURCHASE",
    description: "",
    walletCurrency: "USD",
    targetCurrency: "",
    targetAmount: "",
    conversionRate: "",
    matureDate: "",
    amount: 10,
    fee: "",
    debitNetAmount: 10,
    creditNetAmount: "",
    availableBalance: 100,
    accountBalance,
    createdAt: "2026-09-01T12:00:00-0700",
    requestId: "",
    reference: "",
    noteToSelf: "",
  });
  const rows = [row("first-in-report", 100), row("second-in-report", 90)];
  const filtered = filterNewAirwallexUsdRows(rows, new Set(), 0);
  assert.deepEqual(filtered.map((r) => r.transactionId), ["first-in-report", "second-in-report"]);
});

test("validatesAirwallexBalanceChain uses debit/credit net not amount", () => {
  const row = (id: string, debit: number, credit: number, balance: number): AirwallexUsdSheetRow => ({
    transactionId: id,
    time: "2026-09-01T12:00:00-0700",
    type: "CARD",
    financialTransactionType: "CARD_PURCHASE",
    description: "",
    walletCurrency: "USD",
    targetCurrency: "",
    targetAmount: "",
    conversionRate: "",
    matureDate: "",
    amount: debit || credit,
    fee: "",
    debitNetAmount: debit,
    creditNetAmount: credit,
    availableBalance: balance,
    accountBalance: balance,
    createdAt: "2026-09-01T12:00:00-0700",
    requestId: "",
    reference: "",
    noteToSelf: "",
  });
  const rows = [row("a", 10, 0, 100), row("b", 5, 0, 95)];
  assert.equal(airwallexBalanceDelta(rows[1]!), -5);
  assert.equal(validatesAirwallexBalanceChain(rows, 110), true);
});
