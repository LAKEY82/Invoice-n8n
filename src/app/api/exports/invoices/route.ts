import { z } from "zod";
import { route, badRequest } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceListQuerySchema } from "@/lib/validation/schemas";
import { rateLimit } from "@/lib/security/rate-limit";
import { buildFilter } from "@/services/invoice.service";
import { exportInvoices, fileResponse } from "@/services/export.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = route(async (req) => {
  const user = await requireUser();
  await rateLimit("export", user.id, 20, 600);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const format = z.enum(["csv", "xlsx"]).parse(params.format ?? "csv");
  const query = invoiceListQuerySchema.parse(params);
  const filter = buildFilter(user.id, query);
  if (params.ids) {
    const ids = params.ids.split(",").filter((i) => /^[a-f0-9]{24}$/.test(i));
    if (!ids.length) throw badRequest("No valid invoice ids supplied");
    filter._id = { $in: ids.slice(0, 500) };
  }
  return fileResponse(await exportInvoices(user.id, filter, format));
});
