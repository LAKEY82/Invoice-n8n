import type { Types } from "mongoose";
import { ProcessingLog } from "@/models/ProcessingLog";

type Ref = string | Types.ObjectId;

/** Writes an audit/processing log entry. Never throws — logging must not break the primary operation. */
export async function audit(
  userId: Ref,
  event: string,
  opts: { invoiceId?: Ref | null; jobId?: string | null; level?: "info" | "warn" | "error"; message?: string; meta?: unknown } = {},
) {
  try {
    await ProcessingLog.create({
      userId,
      invoiceId: opts.invoiceId ?? null,
      jobId: opts.jobId ?? null,
      event,
      level: opts.level ?? "info",
      message: opts.message ?? "",
      meta: opts.meta ?? null,
    });
  } catch (e) {
    console.error("[audit] failed to write log", e);
  }
}
