/** Thin fetch wrapper for the browser. Throws Error(message) with the server's safe error text. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issues = Array.isArray(data.issues) ? `: ${data.issues.map((i: { message: string }) => i.message).join(", ")}` : "";
    throw new Error(`${data.error ?? `Request failed (${res.status})`}${issues}`);
  }
  return data as T;
}

export const POLL_INTERVAL_MS = Math.max(3000, Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 7000);
