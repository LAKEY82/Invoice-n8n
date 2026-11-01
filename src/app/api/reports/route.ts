import { NextResponse } from "next/server";
import { route } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { buildReport } from "@/services/report.service";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const user = await requireUser();
  const p = Object.fromEntries(new URL(req.url).searchParams);
  return NextResponse.json(await buildReport(user.id, { from: p.from, to: p.to, approvedOnly: p.approvedOnly === "true" }));
});
