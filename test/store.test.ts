import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.ts";

const session = (id: string, uid: string, hash: string) => ({
  session_id: id,
  aspsp: { name: "Test Bank", country: "DK" },
  psu_type: "personal",
  access: { valid_until: "2027-01-01T00:00:00Z" },
  accounts: [{ uid, name: "Everyday", currency: "DKK", identification_hash: hash }],
});

test("re-consent replaces the account uid but keeps label", () => {
  const dir = mkdtempSync(join(tmpdir(), "bank-"));
  const s = new Store(join(dir, "store.json"));
  s.addSession(session("s1", "u1", "h1"));
  s.update((d) => void (d.accounts["u1"]!.label = "Main"));

  s.addSession(session("s2", "u2", "h1"));
  assert.deepEqual(Object.keys(s.data.accounts), ["u2"]);
  assert.equal(s.data.accounts["u2"]!.label, "Main");
  assert.deepEqual(Object.keys(s.data.sessions), ["s2"], "session without accounts is dropped");

  const reloaded = new Store(join(dir, "store.json"));
  assert.equal(reloaded.accounts().length, 1);
});

test("pending auth is single use", () => {
  const s = new Store(join(mkdtempSync(join(tmpdir(), "bank-")), "store.json"));
  s.addPendingAuth({ state: "st", bank: { name: "B", country: "DK" }, started: new Date().toISOString() });
  assert.equal(s.takePendingAuth("st")?.bank.name, "B");
  assert.equal(s.takePendingAuth("st"), undefined);
});
