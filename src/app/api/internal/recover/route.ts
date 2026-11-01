import { NextResponse } from "next/server";
import { route } from "@/lib/api/errors";
import { requireInternalOrCron } from "@/lib/auth/internal";
import { recoverStaleJobs } from "@/services/processing.service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Called by the Vercel cron (see vercel.json) or manually: retries due jobs, releases stuck ones, cleans orphans. */
async function handle(req: Request) {
  requireInternalOrCron(req);
  return NextResponse.json(await recoverStaleJobs({ maxDispatch: 10 }));
}
export const GET = route(handle);
export const POST = route(handle);
