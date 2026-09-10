import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("mercury sync store remembers transaction ids", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mercury-sync-"));
  const prev = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    const { hasMercuryTransactionId, loadMercuryTransactionIds, rememberMercuryTransactionIds } = await import("../src/mercury-sync-store.ts");
    const known = loadMercuryTransactionIds();
    assert.equal(hasMercuryTransactionId("abc", known), false);
    rememberMercuryTransactionIds(["abc", "def"]);
    const updated = loadMercuryTransactionIds();
    assert.equal(hasMercuryTransactionId("abc", updated), true);
    assert.equal(hasMercuryTransactionId("xyz", updated), false);
  } finally {
    if (prev) process.env.DATA_DIR = prev;
    else delete process.env.DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
