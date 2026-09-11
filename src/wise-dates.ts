function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** Wise USD date column: DD-MM-YYYY */
export function formatWiseDateDash(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${pad2(d.getUTCDate())}-${pad2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** Wise EUR date column: DD/MM/YYYY */
export function formatWiseDateSlash(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function formatWiseDatetime(iso: string, sep: "-" | "/"): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const date = sep === "-"
    ? `${pad2(d.getUTCDate())}-${pad2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`
    : `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return `${date} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}.${pad3(d.getUTCMilliseconds())}`;
}

/** Wise USD datetime column: DD-MM-YYYY HH:mm:ss.SSS */
export function formatWiseDatetimeDash(iso: string): string {
  return formatWiseDatetime(iso, "-");
}

/** Wise EUR datetime column: DD/MM/YYYY HH:mm:ss.SSS */
export function formatWiseDatetimeSlash(iso: string): string {
  return formatWiseDatetime(iso, "/");
}

export function wiseInstantMs(value: string): number {
  const text = String(value || "").trim();
  if (!text) return 0;
  const m = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})(?:\s(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?$/);
  if (m) {
    return Date.UTC(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0),
      Number(String(m[7] ?? "0").slice(0, 3)),
    );
  }
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : 0;
}
