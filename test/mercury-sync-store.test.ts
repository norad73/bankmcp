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
    const { hasMercuryTransactionId, rememberMercuryTransactionIds } = await import("../src/mercury-sync-store.ts");
    assert.equal(hasMercuryTransactionId("abc"), false);
    rememberMercuryTransactionIds(["abc", "def"]);
    assert.equal(hasMercuryTransactionId("abc"), true);
    assert.equal(hasMercuryTransactionId("xyz"), false);
  } finally {
    if (prev) process.env.DATA_DIR = prev;
    else delete process.env.DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
