// Enable Banking diagnostic log — JSON lines under DATA_DIR/logs/.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";

const logPath = () => join(config.dataDir, "logs", "eb-debug.jsonl");

export function ebLog(event: string, detail: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...detail });
  console.log(`[bank-eb] ${event}`, detail);
  try {
    mkdirSync(join(config.dataDir, "logs"), { recursive: true });
    appendFileSync(logPath(), `${line}\n`, { encoding: "utf8" });
  } catch (err) {
    console.log(`[bank-eb] log write failed: ${(err as Error).message}`);
  }
}

export function ebLogPath(): string {
  return logPath();
}
