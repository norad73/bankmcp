import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("seedBalanceCacheForLabel seeds empty Enable Banking sessions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bank-"));
  const prevData = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;

  const { Store } = await import("../src/store.ts");
  const { seedBalanceCacheForLabel, emptySessionUid } = await import("../src/seed-cache.ts");
  const { getCachedBalance } = await import("../src/balance-cache.ts");

  const storePath = join(dir, "bank.json");
  const s = new Store(storePath);
  s.addSession(
    {
      session_id: "usa-1",
      aspsp: { name: "Eurobank", country: "GR" },
      psu_type: "business",
      access: { valid_until: "2027-03-08T00:00:00Z" },
      accounts: [],
    },
    { label: "Eurobank USA Branch" },
  );

  const seeded = seedBalanceCacheForLabel({
    sessionLabel: "Eurobank USA Branch",
    available: 1494.3,
    booked: 1494.3,
    currency: "EUR",
  });

  assert.equal(seeded[0]?.accountUid, emptySessionUid("usa-1"));
  assert.equal(getCachedBalance(emptySessionUid("usa-1"))?.available, 1494.3);

  if (prevData) process.env.DATA_DIR = prevData;
  else delete process.env.DATA_DIR;
});
