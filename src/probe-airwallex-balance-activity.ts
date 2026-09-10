import { fetchBalanceActivityReportCsv, isAirwallexConfigured } from "./airwallex.ts";

if (!isAirwallexConfigured()) {
  console.error("Airwallex not configured");
  process.exit(1);
}

const { report, csv } = await fetchBalanceActivityReportCsv({
  currency: "USD",
  fromDate: "2026-08-25",
  toDate: "2026-08-31",
  timeZone: "UTC",
});

const lines = csv.trim().split(/\r?\n/);
const preview = lines.slice(0, 6);

console.log("AWX_BAR_START");
console.log(JSON.stringify({ report, lineCount: lines.length, header: lines[0] ?? "", previewRows: preview.slice(1) }, null, 2));
console.log("AWX_BAR_END");
