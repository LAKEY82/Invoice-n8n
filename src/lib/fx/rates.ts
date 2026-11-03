/**
 * Exchange rates, free and keyless, cached for 12 hours:
 *  1. open.er-api.com (~160 currencies, including LKR), updated daily
 *  2. Frankfurter / European Central Bank (~30 major currencies) as a fallback
 * Rates are the latest published ones, not historical.
 */
export interface FxRates {
  date: string;
  /** Units of each currency per 1 EUR (EUR itself is 1). */
  rates: Record<string, number>;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 43_200 }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export async function getRates(): Promise<FxRates | null> {
  try {
    const j = (await fetchJson("https://open.er-api.com/v6/latest/EUR")) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (j.result === "success" && j.rates) {
      const updated = j.time_last_update_utc ? new Date(j.time_last_update_utc) : new Date();
      return { date: updated.toISOString().slice(0, 10), rates: { ...j.rates, EUR: 1 } };
    }
  } catch {
    // fall through to the ECB feed
  }
  try {
    const j = (await fetchJson("https://api.frankfurter.dev/v1/latest")) as { date?: string; rates?: Record<string, number> };
    if (j.rates && j.date) return { date: j.date, rates: { ...j.rates, EUR: 1 } };
  } catch {
    // no rates available
  }
  return null;
}

/** Converts between two currencies. Returns null when either currency has no published rate. */
export function convertAmount(amount: number, from: string, to: string, fx: FxRates | null): number | null {
  if (from === to) return amount;
  const a = fx?.rates[from];
  const b = fx?.rates[to];
  if (!a || !b) return null;
  return (amount / a) * b;
}
