import { NextResponse } from "next/server";
import { route, readJson, notFound } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { integrationSaveSchema } from "@/lib/validation/schemas";
import { rateLimit } from "@/lib/security/rate-limit";
import { isProvider, removeAiKey, saveAiKey } from "@/services/integration.service";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ provider: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  await rateLimit("integration", user.id, 20, 600);
  const { provider } = await params;
  if (!isProvider(provider)) throw notFound("Unknown provider");
  const input = integrationSaveSchema.parse(await readJson(req));
  const test = await saveAiKey(user.id, provider, input.apiKey, input.model);
  return NextResponse.json({ ok: true, test });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  const { provider } = await params;
  if (!isProvider(provider)) throw notFound("Unknown provider");
  await removeAiKey(user.id, provider);
  return NextResponse.json({ ok: true });
});
