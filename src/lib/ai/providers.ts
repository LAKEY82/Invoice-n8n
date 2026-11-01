import { env } from "@/lib/env";
import { connectDB } from "@/lib/mongodb/connect";
import { Integration, type IntegrationProvider } from "@/models/Integration";
import { BusinessSettings } from "@/models/BusinessSettings";
import { decryptSecret } from "@/lib/security/crypto";

export interface AiConfig {
  provider: IntegrationProvider;
  apiKey: string;
  model: string;
  source: "user" | "environment";
}

export const defaultModel = (p: IntegrationProvider) => (p === "gemini" ? env().GEMINI_MODEL : env().OPENAI_MODEL);

async function configFor(userId: string, provider: IntegrationProvider): Promise<AiConfig | null> {
  const row = await Integration.findOne({ userId, provider }).lean();
  if (row) {
    return { provider, apiKey: decryptSecret(row.encryptedSecret), model: row.model || defaultModel(provider), source: "user" };
  }
  const envKey = provider === "gemini" ? env().GEMINI_API_KEY : env().OPENAI_API_KEY;
  return envKey ? { provider, apiKey: envKey, model: defaultModel(provider), source: "environment" } : null;
}

/** Picks the user's preferred provider, then falls back to the other one if only it is configured. */
export async function resolveAiConfig(userId: string): Promise<AiConfig | null> {
  await connectDB();
  const settings = await BusinessSettings.findOne({ userId }).lean();
  const preferred: IntegrationProvider = settings?.preferredProvider ?? env().AI_PROVIDER;
  const order: IntegrationProvider[] = preferred === "gemini" ? ["gemini", "openai"] : ["openai", "gemini"];
  for (const p of order) {
    const c = await configFor(userId, p);
    if (c) return c;
  }
  return null;
}

export async function testProvider(provider: IntegrationProvider, apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res =
      provider === "gemini"
        ? await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
            headers: { "x-goog-api-key": apiKey },
            signal: AbortSignal.timeout(15000),
          })
        : await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(15000),
          });
    if (res.ok) return { ok: true, message: "Key accepted by the provider." };
    if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, message: "The provider rejected this API key." };
    if (res.status === 429) return { ok: false, message: "Rate limited by the provider — the key may still be valid." };
    return { ok: false, message: `Provider returned HTTP ${res.status}.` };
  } catch (e) {
    return { ok: false, message: `Could not reach provider: ${(e as Error).message}` };
  }
}
