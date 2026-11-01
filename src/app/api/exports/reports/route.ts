import { z } from "zod";
import { route } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";
import { buildReport } from "@/services/report.service";
import { exportReport, fileResponse } from "@/services/export.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = route(async (req) => {
  const user = await requireUser();
  await rateLimit("export", user.id, 20, 600);
  const p = Object.fromEntries(new URL(req.url).searchParams);
  const format = z.enum(["csv", "xlsx"]).parse(p.format ?? "xlsx");
  const report = await buildReport(user.id, { from: p.from, to: p.to, approvedOnly: p.approvedOnly === "true" });
  return fileResponse(await exportReport(report, format));
});
