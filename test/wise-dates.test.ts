import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatWiseDateDash,
  formatWiseDatetimeDash,
  formatWiseDatetimeSlash,
  wiseInstantMs,
} from "../src/wise-dates.ts";

test("formatWiseDateDash uses DD-MM-YYYY", () => {
  assert.equal(formatWiseDateDash("2026-08-13T10:37:24.081Z"), "13-08-2026");
});

test("formatWiseDatetimeDash matches existing Wise USD sheet format", () => {
  assert.equal(formatWiseDatetimeDash("2026-08-13T10:37:24.081Z"), "13-08-2026 10:37:24.081");
});

test("formatWiseDatetimeSlash matches Wise EUR datetime format", () => {
  assert.equal(formatWiseDatetimeSlash("2026-08-13T10:37:24.081Z"), "13/08/2026 10:37:24.081");
});

test("wiseInstantMs parses dash and slash datetimes", () => {
  const dash = wiseInstantMs("13-08-2026 10:37:24.081");
  const slash = wiseInstantMs("13/08/2026 10:37:24.081");
  assert.equal(dash, slash);
  assert.ok(dash > 0);
});
