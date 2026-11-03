import { NextResponse } from "next/server";
import { z } from "zod";
import { route, readJson } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { getTheme, setTheme } from "@/services/settings.service";

export const runtime = "nodejs";

const bodySchema = z.object({ themeColor: z.enum(["green", "blue", "red", "orange", "pink"]) });

export const GET = route(async () => {
  const user = await requireUser();
  return NextResponse.json({ themeColor: await getTheme(user.id) });
});

export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  const { themeColor } = bodySchema.parse(await readJson(req));
  await setTheme(user.id, themeColor);
  return NextResponse.json({ themeColor });
});
