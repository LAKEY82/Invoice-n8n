import { NextResponse } from "next/server";
import { route, readJson } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { uploadRequestSchema } from "@/lib/validation/schemas";
import { rateLimit } from "@/lib/security/rate-limit";
import { createUpload } from "@/services/invoice.service";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  const user = await requireUser();
  await rateLimit("upload", user.id, 60, 600);
  const input = uploadRequestSchema.parse(await readJson(req));
  return NextResponse.json(await createUpload(user.id, input), { status: 201 });
});
