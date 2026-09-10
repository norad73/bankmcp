import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("airwallex sync store remembers transaction ids", async () => {
  const dir = mkdtempSync(join(tmpdir(), "airwallex-sync-"));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    const { loadAirwallexTransactionIds, rememberAirwallexTransactionIds } = await import("../src/airwallex-sync-store.ts");
    const known = loadAirwallexTransactionIds();
    assert.equal(known.has("abc"), false);
    rememberAirwallexTransactionIds(["abc", "def"]);
    const updated = loadAirwallexTransactionIds();
    assert.equal(updated.has("abc"), true);
    assert.equal(updated.has("xyz"), false);
  } finally {
    if (prev) process.env.DATA_DIR = prev;
    else delete process.env.DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
