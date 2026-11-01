import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security/crypto";
import { unauthorized } from "@/lib/api/errors";

function provided(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : req.headers.get("x-api-secret") ?? "";
}

/** Authenticates server-to-server calls from n8n with the shared N8N_API_SECRET. */
export function requireInternal(req: Request) {
  const expected = env().N8N_API_SECRET;
  if (!expected) throw new Error("N8N_API_SECRET is not configured");
  const p = provided(req);
  if (!p || !safeEqual(p, expected)) throw unauthorized("Invalid internal credentials");
}

/** Recovery endpoint: accepts the n8n secret, or CRON_SECRET (which Vercel Cron sends automatically). */
export function requireInternalOrCron(req: Request) {
  const p = provided(req);
  const { N8N_API_SECRET, CRON_SECRET } = env();
  const okN8n = Boolean(N8N_API_SECRET && p && safeEqual(p, N8N_API_SECRET));
  const okCron = Boolean(CRON_SECRET && p && safeEqual(p, CRON_SECRET));
  if (!okN8n && !okCron) throw unauthorized("Invalid internal credentials");
}
