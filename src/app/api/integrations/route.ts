import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { listIntegrations, setPreferredProvider } from "@/services/integration.service";

export const runtime = "nodejs";

/** Never includes secrets — only masked hints and stored test results. */
export const GET = route(async () => {
  const user = await requireUser();
  return NextResponse.json(await listIntegrations(user.id));
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const { preferredProvider } = z.object({ preferredProvider: z.enum(["gemini", "openai"]) }).parse(await readJson(req));
  await setPreferredProvider(user.id, preferredProvider);
  return NextResponse.json({ ok: true });
});
