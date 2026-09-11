import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("airwallex sync store remembers transaction ids per currency", async () => {
  const dir = mkdtempSync(join(tmpdir(), "airwallex-sync-"));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    const { loadAirwallexTransactionIds, rememberAirwallexTransactionIds } = await import("../src/airwallex-sync-store.ts");
    const usd = loadAirwallexTransactionIds("USD");
    const eur = loadAirwallexTransactionIds("EUR");
    assert.equal(usd.has("abc"), false);
    assert.equal(eur.has("abc"), false);
    rememberAirwallexTransactionIds("USD", ["abc", "def"]);
    rememberAirwallexTransactionIds("EUR", ["xyz"]);
    assert.equal(loadAirwallexTransactionIds("USD").has("abc"), true);
    assert.equal(loadAirwallexTransactionIds("USD").has("xyz"), false);
    assert.equal(loadAirwallexTransactionIds("EUR").has("xyz"), true);
  } finally {
    if (prev) process.env.DATA_DIR = prev;
    else delete process.env.DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
