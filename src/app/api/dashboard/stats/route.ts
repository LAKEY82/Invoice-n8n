import { NextResponse } from "next/server";
import { route } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { getDashboard } from "@/services/dashboard.service";

export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  return NextResponse.json(await getDashboard(user.id, new URL(req.url).searchParams.get("currency") ?? undefined));
});
