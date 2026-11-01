import { NextResponse } from "next/server";
import { route } from "@/lib/api/errors";
import { requireInternal } from "@/lib/auth/internal";
import { getJobForN8n } from "@/services/processing.service";

export const runtime = "nodejs";

/** n8n fetches job details here (short-lived file URL + AI credentials). Secret-authenticated. */
export const GET = route<{ params: Promise<{ jobId: string }> }>(async (req, { params }) => {
  requireInternal(req);
  const job = await getJobForN8n((await params).jobId);
  return NextResponse.json(job, { headers: { "Cache-Control": "no-store" } });
});
