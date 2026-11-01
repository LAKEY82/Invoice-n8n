import { NextResponse } from "next/server";
import { route } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { queueReprocess } from "@/services/processing.service";
import { getInvoice } from "@/services/invoice.service";

export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const user = await requireUser();
  await rateLimit("reprocess", user.id, 30, 600);
  const { id } = await params;
  await queueReprocess(user.id, id);
  return NextResponse.json({ invoice: await getInvoice(user.id, id) });
});
