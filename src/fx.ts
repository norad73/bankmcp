// Live FX rates for balance USD equivalents (Frankfurter / ECB, no API key).
export interface FxRates {
  date: string;
  /** Multiply an amount in `currency` by this to get USD. */
  toUsd: Record<string, number>;
}

export async function fetchRatesToUsd(currencies: string[]): Promise<FxRates | undefined> {
  const toUsd: Record<string, number> = { USD: 1 };
  const foreign = [...new Set(currencies.map((c) => c.toUpperCase()).filter((c) => c !== "USD"))];
  if (!foreign.length) return { date: new Date().toISOString().slice(0, 10), toUsd };

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${foreign.join(",")}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
    for (const [cur, perUsd] of Object.entries(data.rates ?? {})) {
      if (perUsd > 0) toUsd[cur.toUpperCase()] = 1 / perUsd;
    }
    return { date: data.date ?? "", toUsd };
  } catch {
    return undefined;
  }
}

export function amountInUsd(amount: number | undefined, currency: string, fx: FxRates | undefined): number | undefined {
  if (amount === undefined || !fx) return undefined;
  const rate = fx.toUsd[currency.toUpperCase()];
  if (rate === undefined) return undefined;
  return amount * rate;
}
