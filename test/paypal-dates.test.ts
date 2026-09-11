import assert from "node:assert/strict";
import { test } from "node:test";

// Mirror paypalRangeEnd from paypal.ts (30-day windows for PayPal's 31-day API limit).
function paypalRangeEnd(start: Date, maxEnd: Date): Date {
  const cap = new Date(start.getTime() + 30 * 86_400_000);
  return cap.getTime() < maxEnd.getTime() ? cap : maxEnd;
}

test("paypalRangeEnd caps each request window to 30 days", () => {
  const start = new Date("2026-06-01T00:00:00Z");
  const end = new Date("2026-09-11T23:59:59Z");
  const windowEnd = paypalRangeEnd(start, end);
  const spanDays = (windowEnd.getTime() - start.getTime()) / 86_400_000;
  assert.ok(spanDays <= 30);
  assert.equal(windowEnd.toISOString().slice(0, 10), "2026-07-01");
});
