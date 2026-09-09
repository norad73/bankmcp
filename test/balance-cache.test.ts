import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("balance cache reuses entries for the same day only", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bank-"));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  const { getCachedBalance, setCachedBalance } = await import("../src/balance-cache.ts");

  setCachedBalance("acct-1", { booked: 100, available: 100, currency: "EUR" });
  assert.equal(getCachedBalance("acct-1")?.available, 100);
  assert.equal(getCachedBalance("acct-1", "2020-01-01"), undefined);

  const { athensDate } = await import("../src/data.ts");
  setCachedBalance("acct-2", { available: 50, currency: "EUR", date: athensDate() });
  assert.equal(getCachedBalance("acct-2")?.available, 50);

  if (prev) process.env.DATA_DIR = prev;
  else delete process.env.DATA_DIR;
});

test("seedBalanceCache picks the named account when a session has several", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bank-"));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  const { seedBalanceCache, getCachedBalance } = await import("../src/balance-cache.ts");

  const seeded = seedBalanceCache(
    () => [
      { uid: "a1", displayName: "02", currency: "EUR" },
      { uid: "a2", displayName: "ΑΛΕΞΑΝΔΡΟΣ", currency: "EUR" },
    ],
    { sessionLabel: "Eurobank IKE", available: 9844.24, currency: "EUR" },
  );

  assert.equal(seeded.length, 1);
  assert.equal(seeded[0]?.accountUid, "a2");
  assert.equal(getCachedBalance("a2")?.available, 9844.24);

  if (prev) process.env.DATA_DIR = prev;
  else delete process.env.DATA_DIR;
});
