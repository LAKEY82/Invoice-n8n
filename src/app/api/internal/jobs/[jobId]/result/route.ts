import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/api/errors";
import { requireInternal } from "@/lib/auth/internal";
import { jobResultSchema } from "@/lib/validation/schemas";
import { applyJobResult } from "@/services/processing.service";

export const runtime = "nodejs";

/** Processing callback from n8n. Idempotent — stale or repeated callbacks return applied:false with 200. */
export const POST = route<{ params: Promise<{ jobId: string }> }>(async (req, { params }) => {
  requireInternal(req);
  const body = jobResultSchema.parse(await readJson(req));
  const outcome = await applyJobResult((await params).jobId, body);
  return NextResponse.json(outcome);
});
