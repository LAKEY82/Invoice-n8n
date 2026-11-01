import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceUpdateSchema } from "@/lib/validation/schemas";
import { deleteInvoice, getInvoice, updateInvoice } from "@/services/invoice.service";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  return NextResponse.json({ invoice: await getInvoice(user.id, (await params).id) });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  const input = invoiceUpdateSchema.parse(await readJson(req));
  return NextResponse.json({ invoice: await updateInvoice(user.id, (await params).id, input) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  await deleteInvoice(user.id, (await params).id);
  return NextResponse.json({ ok: true });
});
