import { listAirwallexFinancialTransactions, isAirwallexConfigured } from "../src/airwallex.ts";

if (!isAirwallexConfigured()) {
  console.error("Airwallex not configured (AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY)");
  process.exit(1);
}

const { items, hasMore } = await listAirwallexFinancialTransactions({
  currency: "USD",
  pageSize: 5,
  fromCreatedAt: "2026-08-01T00:00:00Z",
});

console.log("AWX_PROBE_START");
console.log(JSON.stringify({ hasMore, items }, null, 2));
console.log("AWX_PROBE_END");
