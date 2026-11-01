import { NextResponse } from "next/server";
import { route } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceListQuerySchema } from "@/lib/validation/schemas";
import { listInvoices } from "@/services/invoice.service";

export const runtime = "nodejs";

export const GET = route(async (req) => {
  const user = await requireUser();
  const query = invoiceListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listInvoices(user.id, query));
});
