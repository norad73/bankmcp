import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groupAvailableSummary,
  groupBalanceRows,
  groupUsdTotal,
} from "../src/balance-groups.ts";
import type { BalanceDisplayRow } from "../src/balance-groups.ts";

const fx = { date: "2026-09-09", toUsd: { EUR: 1.1, USD: 1 } };

test("groupBalanceRows groups by source preserving order", () => {
  const rows: BalanceDisplayRow[] = [
    { uid: "m1", source: "Mercury", account: "A", currency: "USD", available: 1 },
    { uid: "w1", source: "Wise", account: "EUR", currency: "EUR", available: 10 },
    { uid: "m2", source: "Mercury", account: "B", currency: "USD", available: 0 },
  ];
  const groups = groupBalanceRows(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.source, "Mercury");
  assert.equal(groups[0]?.accounts.length, 2);
  assert.equal(groups[1]?.source, "Wise");
});

test("groupAvailableSummary sums when single currency", () => {
  const accounts: BalanceDisplayRow[] = [
    { uid: "m1", source: "Mercury", account: "A", currency: "USD", available: 100 },
    { uid: "m2", source: "Mercury", account: "B", currency: "USD", available: 50 },
  ];
  assert.deepEqual(groupAvailableSummary(accounts), { currency: "USD", amount: 150 });
});

test("groupAvailableSummary is undefined for mixed currencies", () => {
  const accounts: BalanceDisplayRow[] = [
    { uid: "w1", source: "Wise", account: "USD", currency: "USD", available: 100 },
    { uid: "w2", source: "Wise", account: "EUR", currency: "EUR", available: 50 },
  ];
  assert.equal(groupAvailableSummary(accounts), undefined);
});

test("groupUsdTotal converts mixed currencies", () => {
  const accounts: BalanceDisplayRow[] = [
    { uid: "w1", source: "Wise", account: "USD", currency: "USD", available: 100 },
    { uid: "w2", source: "Wise", account: "EUR", currency: "EUR", available: 100 },
  ];
  assert.equal(groupUsdTotal(accounts, fx), 210);
});
