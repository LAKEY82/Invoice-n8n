import { NextResponse } from "next/server";
import { route } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { markDuplicate } from "@/services/invoice.service";

export const runtime = "nodejs";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const user = await requireUser();
  return NextResponse.json({ invoice: await markDuplicate(user.id, (await params).id) });
});
