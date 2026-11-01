import { NextResponse } from "next/server";
import { route, notFound } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { isProvider, testIntegration } from "@/services/integration.service";

export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = route<{ params: Promise<{ provider: string }> }>(async (_req, { params }) => {
  const user = await requireUser();
  await rateLimit("integration-test", user.id, 20, 600);
  const { provider } = await params;
  if (provider !== "n8n" && !isProvider(provider)) throw notFound("Unknown provider");
  return NextResponse.json(await testIntegration(user.id, provider as never));
});
