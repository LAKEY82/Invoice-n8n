import { connectDB } from "@/lib/mongodb/connect";
import { env } from "@/lib/env";
import { Integration, INTEGRATION_PROVIDERS, type IntegrationProvider } from "@/models/Integration";
import { BusinessSettings } from "@/models/BusinessSettings";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/security/crypto";
import { defaultModel, testProvider } from "@/lib/ai/providers";
import { checkN8nHealth, n8nConfigured } from "@/lib/n8n/client";
import { getStorage } from "@/lib/storage/storage.factory";
import { badRequest } from "@/lib/api/errors";
import { audit } from "@/services/audit.service";

export const isProvider = (p: string): p is IntegrationProvider => (INTEGRATION_PROVIDERS as readonly string[]).includes(p);

export async function listIntegrations(userId: string) {
  await connectDB();
  const [rows, settings] = await Promise.all([Integration.find({ userId }).lean(), BusinessSettings.findOne({ userId }).lean()]);
  const e = env();
  const ai = INTEGRATION_PROVIDERS.map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    const envKey = provider === "gemini" ? e.GEMINI_API_KEY : e.OPENAI_API_KEY;
    return {
      provider,
      configured: Boolean(row || envKey),
      source: row ? ("user" as const) : envKey ? ("environment" as const) : ("none" as const),
      keyHint: row?.secretHint ?? (envKey ? maskSecret(envKey) : ""),
      model: row?.model || defaultModel(provider),
      lastTestedAt: row?.lastTestedAt?.toISOString() ?? null,
      lastTestOk: row?.lastTestOk ?? null,
      lastTestMessage: row?.lastTestMessage ?? null,
    };
  });
  return {
    ai,
    preferredProvider: settings?.preferredProvider ?? e.AI_PROVIDER,
    n8n: { configured: n8nConfigured(), webhookHost: e.N8N_WEBHOOK_URL ? new URL(e.N8N_WEBHOOK_URL).host : null },
    storage: { configured: getStorage().isConfigured() },
    googleSheets: { available: false, note: "Not implemented in this MVP — use XLSX/CSV export." },
  };
}

export async function saveAiKey(userId: string, provider: IntegrationProvider, apiKey: string, model?: string | null) {
  await connectDB();
  const test = await testProvider(provider, apiKey);
  if (!test.ok && /rejected/.test(test.message)) throw badRequest(test.message, "KEY_REJECTED");
  await Integration.findOneAndUpdate(
    { userId, provider },
    {
      $set: {
        encryptedSecret: encryptSecret(apiKey),
        secretHint: maskSecret(apiKey),
        model: model || null,
        lastTestedAt: new Date(),
        lastTestOk: test.ok,
        lastTestMessage: test.message,
      },
    },
    { upsert: true },
  );
  await audit(userId, "integration.saved", { message: provider });
  return test;
}

export async function removeAiKey(userId: string, provider: IntegrationProvider) {
  await connectDB();
  await Integration.deleteOne({ userId, provider });
  await audit(userId, "integration.removed", { message: provider });
}

export async function testIntegration(userId: string, provider: IntegrationProvider | "n8n") {
  await connectDB();
  if (provider === "n8n") {
    const h = await checkN8nHealth();
    return { ok: h.reachable, message: h.message };
  }
  const row = await Integration.findOne({ userId, provider });
  const key = row ? decryptSecret(row.encryptedSecret) : provider === "gemini" ? env().GEMINI_API_KEY : env().OPENAI_API_KEY;
  if (!key) return { ok: false, message: "No API key is configured for this provider." };
  const result = await testProvider(provider, key);
  if (row) {
    row.lastTestedAt = new Date();
    row.lastTestOk = result.ok;
    row.lastTestMessage = result.message;
    await row.save();
  }
  return result;
}

export async function setPreferredProvider(userId: string, provider: IntegrationProvider) {
  await connectDB();
  await BusinessSettings.findOneAndUpdate({ userId }, { $set: { preferredProvider: provider } }, { upsert: true });
}
