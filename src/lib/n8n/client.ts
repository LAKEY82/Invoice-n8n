import { env } from "@/lib/env";

export interface DispatchResult {
  ok: boolean;
  /** true for timeouts, 5xx, 429 and network errors (cold start, outage) — safe to retry later. */
  retryable: boolean;
  error?: string;
}

export function n8nConfigured() {
  const e = env();
  return Boolean(e.N8N_WEBHOOK_URL && e.N8N_API_SECRET);
}

/**
 * Hands a job to n8n. The workflow responds immediately (200 "Respond immediately"), so this call is short.
 * A Render free instance that is asleep can take 30–60s to wake; we time out quickly and let the retry
 * scheduler try again instead of marking the invoice FAILED.
 */
export async function dispatchToN8n(job: { jobId: string; invoiceId: string }): Promise<DispatchResult> {
  const e = env();
  if (!n8nConfigured()) return { ok: false, retryable: true, error: "n8n is not configured (N8N_WEBHOOK_URL / N8N_API_SECRET)" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), e.N8N_DISPATCH_TIMEOUT_MS);
  try {
    const res = await fetch(e.N8N_WEBHOOK_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${e.N8N_API_SECRET}`,
        "Idempotency-Key": job.jobId,
      },
      body: JSON.stringify({ ...job, appUrl: e.NEXT_PUBLIC_APP_URL }),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (res.ok) return { ok: true, retryable: false };
    const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
    return { ok: false, retryable, error: `n8n responded with HTTP ${res.status}` };
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    return {
      ok: false,
      retryable: true,
      error: aborted ? "n8n did not respond in time (possibly waking from sleep)" : `n8n unreachable: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Live reachability check for the Integrations page. Uses n8n's /healthz on the webhook's origin. */
export async function checkN8nHealth(): Promise<{ configured: boolean; reachable: boolean; message: string }> {
  const e = env();
  if (!n8nConfigured()) return { configured: false, reachable: false, message: "N8N_WEBHOOK_URL and N8N_API_SECRET are not set." };
  const origin = new URL(e.N8N_WEBHOOK_URL!).origin;
  const started = Date.now();
  try {
    const res = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    const ms = Date.now() - started;
    return res.ok
      ? { configured: true, reachable: true, message: `n8n reachable (${ms} ms${ms > 5000 ? ", likely woke from sleep" : ""}).` }
      : { configured: true, reachable: false, message: `n8n health check returned HTTP ${res.status}.` };
  } catch (err) {
    return { configured: true, reachable: false, message: `n8n not reachable: ${(err as Error).message}` };
  }
}
