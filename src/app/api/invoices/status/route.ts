import { NextResponse, after } from "next/server";
import { route } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { statusSnapshot } from "@/services/invoice.service";
import { recoverStaleJobs } from "@/services/processing.service";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Polled by the UI while invoices are in flight. Also nudges retries/recovery after responding. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const ids = new URL(req.url).searchParams.get("ids")?.split(",").filter(Boolean);
  const snapshot = await statusSnapshot(user.id, ids);
  if (snapshot.activeCount > 0) after(() => recoverStaleJobs({ userId: user.id }).catch((e) => console.error("[recover]", e)));
  return NextResponse.json(snapshot);
});
