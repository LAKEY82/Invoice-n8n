/**
 * Exchange rates from the European Central Bank via Frankfurter (https://frankfurter.dev): free, no API key.
 * Covers ~30 major currencies. Rates are the latest published ones and are cached for 12 hours.
 */
export interface FxRates {
  date: string;
  /** Units of each currency per 1 EUR (EUR itself is 1). */
  rates: Record<string, number>;
}

export async function getRates(): Promise<FxRates | null> {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest", {
      next: { revalidate: 43_200 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { date?: string; rates?: Record<string, number> };
    if (!j.rates || !j.date) return null;
    return { date: j.date, rates: { ...j.rates, EUR: 1 } };
  } catch {
    return null;
  }
}

/** Converts between two currencies. Returns null when either currency has no published rate. */
export function convertAmount(amount: number, from: string, to: string, fx: FxRates | null): number | null {
  if (from === to) return amount;
  const a = fx?.rates[from];
  const b = fx?.rates[to];
  if (!a || !b) return null;
  return (amount / a) * b;
}
