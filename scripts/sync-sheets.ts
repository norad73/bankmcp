import { syncBalancesToSheet } from "../src/sync-sheets.ts";

syncBalancesToSheet()
  .then((r) => {
    console.log(JSON.stringify({ ok: true, count: r.rows.length, rows: r.rows }, null, 2));
  })
  .catch((err) => {
    console.error(String(err));
    process.exit(1);
  });
