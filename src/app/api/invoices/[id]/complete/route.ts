import { NextResponse } from "next/server";
import { route } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { completeUpload } from "@/services/invoice.service";

export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const user = await requireUser();
  return NextResponse.json(await completeUpload(user.id, (await params).id));
});
