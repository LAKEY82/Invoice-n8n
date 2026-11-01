import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { bulkSchema } from "@/lib/validation/schemas";
import { bulkAction } from "@/services/invoice.service";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const user = await requireUser();
  const { action, ids } = bulkSchema.parse(await readJson(req));
  return NextResponse.json(await bulkAction(user.id, action, ids));
});
