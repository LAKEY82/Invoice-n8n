import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { approveInvoice } from "@/services/invoice.service";

export const runtime = "nodejs";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser();
  const body = z.object({ acknowledgeWarnings: z.boolean().default(false) }).parse(await readJson(req).catch(() => ({})));
  return NextResponse.json({ invoice: await approveInvoice(user.id, (await params).id, body.acknowledgeWarnings) });
});
