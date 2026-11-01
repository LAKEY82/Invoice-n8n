import { randomUUID } from "crypto";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb/connect";
import { env } from "@/lib/env";
import { Invoice, type InvoiceDoc } from "@/models/Invoice";
import { BusinessSettings } from "@/models/BusinessSettings";
import { dispatchToN8n } from "@/lib/n8n/client";
import { resolveAiConfig } from "@/lib/ai/providers";
import { extractionSchema } from "@/lib/validation/schemas";
import { checkInvoice, hasBlockingIssues } from "@/lib/validation/invoice-checks";
import { normalizeKey } from "@/lib/utils";
import { downloadUrl, deleteObjectSafe } from "@/services/storage.service";
import { audit } from "@/services/audit.service";
import { notFound } from "@/lib/api/errors";

const backoffMs = (attempt: number) => Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
const toDate = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Atomically claims a PENDING invoice (so two requests can never process it concurrently) and hands it to n8n.
 * Failures to reach n8n keep the invoice PENDING with exponential backoff — it is only FAILED after the
 * configured number of attempts. Returns true if n8n accepted the job.
 */
export async function dispatchInvoice(invoiceId: string | Types.ObjectId): Promise<boolean> {
  await connectDB();
  const e = env();
  const now = new Date();

  const peek = await Invoice.findById(invoiceId).select("userId processingStatus").lean();
  if (!peek) return false;
  const userId = String(peek.userId);

  const ai = await resolveAiConfig(userId);
  if (!ai) {
    await Invoice.updateOne(
      { _id: invoiceId, processingStatus: "PENDING" },
      { processingStatus: "FAILED", lastError: "No AI API key configured. Add a Gemini or OpenAI key under Integrations, then reprocess." },
    );
    await audit(userId, "dispatch.no_ai_key", { invoiceId, level: "error", message: "No AI provider key configured" });
    return false;
  }

  const jobId = randomUUID();
  const claimed = await Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      processingStatus: "PENDING",
      $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
    },
    { $set: { processingStatus: "PROCESSING", jobId, processingStartedAt: now, nextRetryAt: null }, $inc: { processingAttempts: 1 } },
    { new: true },
  );
  if (!claimed) return false; // someone else owns it, or backoff has not elapsed

  const result = await dispatchToN8n({ jobId, invoiceId: String(claimed._id) });
  if (result.ok) {
    await audit(userId, "dispatch.accepted", { invoiceId, jobId, message: `Attempt ${claimed.processingAttempts} sent to n8n` });
    return true;
  }

  const exhausted = !result.retryable || claimed.processingAttempts >= e.PROCESSING_MAX_ATTEMPTS;
  await Invoice.updateOne(
    { _id: invoiceId, jobId },
    exhausted
      ? { processingStatus: "FAILED", lastError: result.error, jobId: null }
      : { processingStatus: "PENDING", lastError: result.error, jobId: null, nextRetryAt: new Date(Date.now() + backoffMs(claimed.processingAttempts)) },
  );
  await audit(userId, exhausted ? "dispatch.failed" : "dispatch.retry_scheduled", {
    invoiceId,
    jobId,
    level: exhausted ? "error" : "warn",
    message: result.error,
    meta: { attempt: claimed.processingAttempts },
  });
  return false;
}

/** Resets an invoice for a fresh processing run (manual reprocess). */
export async function queueReprocess(userId: string, invoiceId: string) {
  await connectDB();
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId, userId, processingStatus: { $in: ["FAILED", "REVIEW_REQUIRED", "DUPLICATE", "APPROVED", "PENDING"] } },
    {
      $set: {
        processingStatus: "PENDING",
        processingAttempts: 0,
        nextRetryAt: null,
        jobId: null,
        lastError: null,
        isDuplicate: false,
        duplicateOf: null,
        approvedAt: null,
      },
    },
    { new: true },
  );
  if (!updated) throw notFound("Invoice not found or is currently being processed");
  await audit(userId, "reprocess.requested", { invoiceId });
  await dispatchInvoice(invoiceId);
}

/**
 * Self-healing sweep. Safe to call repeatedly and from several places (status polling, cron):
 *  1. PROCESSING jobs with no callback within the timeout are released (lost job / n8n crash).
 *  2. PENDING invoices whose backoff elapsed are re-dispatched.
 *  3. Uploads that never completed are cleaned up (orphaned R2 objects).
 */
export async function recoverStaleJobs(opts: { userId?: string; maxDispatch?: number } = {}) {
  await connectDB();
  const e = env();
  const scope = opts.userId ? { userId: opts.userId } : {};
  const now = new Date();

  const staleBefore = new Date(Date.now() - e.PROCESSING_TIMEOUT_MINUTES * 60_000);
  const stale = await Invoice.find({ ...scope, processingStatus: "PROCESSING", processingStartedAt: { $lt: staleBefore } })
    .select("_id userId processingAttempts jobId")
    .limit(20)
    .lean();
  for (const inv of stale) {
    const exhausted = inv.processingAttempts >= e.PROCESSING_MAX_ATTEMPTS;
    const res = await Invoice.updateOne(
      { _id: inv._id, processingStatus: "PROCESSING", jobId: inv.jobId },
      exhausted
        ? { processingStatus: "FAILED", lastError: "Processing timed out without a result from n8n.", jobId: null }
        : { processingStatus: "PENDING", lastError: "Processing timed out; retrying.", jobId: null, nextRetryAt: new Date() },
    );
    if (res.modifiedCount) {
      await audit(inv.userId, "job.timeout", { invoiceId: inv._id, jobId: inv.jobId, level: exhausted ? "error" : "warn", message: "No callback received" });
    }
  }

  const due = await Invoice.find({
    ...scope,
    processingStatus: "PENDING",
    $or: [{ nextRetryAt: { $lte: now } }, { nextRetryAt: null, updatedAt: { $lt: new Date(Date.now() - 60_000) } }],
  })
    .select("_id")
    .limit(opts.maxDispatch ?? 3)
    .lean();
  const results = await Promise.allSettled(due.map((d) => dispatchInvoice(d._id)));

  const orphanBefore = new Date(Date.now() - 2 * 60 * 60_000);
  const orphans = await Invoice.find({ ...scope, processingStatus: "PENDING_UPLOAD", createdAt: { $lt: orphanBefore } })
    .select("_id r2ObjectKey userId")
    .limit(20)
    .lean();
  for (const o of orphans) {
    await deleteObjectSafe(o.r2ObjectKey);
    await Invoice.deleteOne({ _id: o._id, processingStatus: "PENDING_UPLOAD" });
    await audit(o.userId, "upload.orphan_cleaned", { invoiceId: o._id });
  }

  return {
    released: stale.length,
    redispatched: results.filter((r) => r.status === "fulfilled" && r.value).length,
    orphansRemoved: orphans.length,
  };
}

/** Data n8n needs to process a job. Includes a short-lived file URL and the AI credentials to use. */
export async function getJobForN8n(jobId: string) {
  await connectDB();
  const inv = await Invoice.findOne({ jobId, processingStatus: "PROCESSING" }).lean();
  if (!inv) throw notFound("Job not found or no longer active");
  const ai = await resolveAiConfig(String(inv.userId));
  if (!ai) throw notFound("No AI provider configured for this user");
  const settings = await BusinessSettings.findOne({ userId: inv.userId }).lean();
  return {
    jobId,
    invoiceId: String(inv._id),
    fileName: inv.fileName,
    fileType: inv.fileType,
    fileSize: inv.fileSize,
    downloadUrl: await downloadUrl(inv.r2ObjectKey, inv.fileName, "attachment"),
    defaultCurrency: settings?.defaultCurrency ?? "USD",
    ai: { provider: ai.provider, apiKey: ai.apiKey, model: ai.model },
    attempt: inv.processingAttempts,
  };
}

type JobResult =
  | { status: "success"; extraction: unknown; provider: string; model: string }
  | { status: "error"; error: string; retryable: boolean };

/**
 * Applies a result posted by n8n. Idempotent: only the invoice's *current* jobId in PROCESSING state is
 * accepted, so duplicate or stale callbacks are acknowledged and ignored.
 */
export async function applyJobResult(jobId: string, result: JobResult): Promise<{ applied: boolean; status?: string }> {
  await connectDB();
  const e = env();
  const inv = await Invoice.findOne({ jobId, processingStatus: "PROCESSING" });
  if (!inv) return { applied: false };
  const userId = String(inv.userId);

  const failOrRetry = async (message: string, retryable: boolean, event: string) => {
    const exhausted = !retryable || inv.processingAttempts >= e.PROCESSING_MAX_ATTEMPTS;
    const update = exhausted
      ? { processingStatus: "FAILED" as const, lastError: message, jobId: null }
      : { processingStatus: "PENDING" as const, lastError: message, jobId: null, nextRetryAt: new Date(Date.now() + backoffMs(inv.processingAttempts)) };
    const res = await Invoice.updateOne({ _id: inv._id, jobId, processingStatus: "PROCESSING" }, update);
    await audit(userId, event, { invoiceId: inv._id, jobId, level: exhausted ? "error" : "warn", message });
    return { applied: res.modifiedCount > 0, status: update.processingStatus };
  };

  if (result.status === "error") return failOrRetry(result.error, result.retryable, "job.error");

  const parsed = extractionSchema.safeParse(result.extraction);
  if (!parsed.success) {
    return failOrRetry(`AI returned a malformed response: ${parsed.error.issues[0]?.message ?? "invalid shape"}`, true, "job.malformed_response");
  }
  const x = parsed.data;
  const settings = await BusinessSettings.findOne({ userId: inv.userId }).lean();
  const currency = x.currency && /^[A-Za-z]{3}$/.test(x.currency.trim()) ? x.currency.trim().toUpperCase() : null;

  const fields = {
    supplierName: x.supplierName?.trim() || null,
    supplierAddress: x.supplierAddress?.trim() || null,
    supplierTaxId: x.supplierTaxId?.trim() || null,
    invoiceNumber: x.invoiceNumber?.trim() || null,
    invoiceDate: toDate(x.invoiceDate),
    dueDate: toDate(x.dueDate),
    currency,
    subtotal: x.subtotal,
    tax: x.tax,
    discount: x.discount,
    total: x.total,
    lineItems: x.lineItems,
  };
  const supplierKey = normalizeKey(fields.supplierName) || null;
  const invoiceNumberKey = normalizeKey(fields.invoiceNumber) || null;
  const issues = checkInvoice(fields, settings?.totalsTolerance ?? 0.02);

  let duplicateOf: Types.ObjectId | null = null;
  if (supplierKey && invoiceNumberKey) {
    const original = await Invoice.findOne({
      userId: inv.userId,
      _id: { $ne: inv._id },
      supplierKey,
      invoiceNumberKey,
      processingStatus: { $in: ["REVIEW_REQUIRED", "APPROVED"] },
    })
      .select("_id")
      .sort({ createdAt: 1 })
      .lean();
    duplicateOf = original?._id ?? null;
  }
  if (duplicateOf) {
    issues.push({ code: "DUPLICATE_INVOICE", severity: "warning", message: "An invoice with the same supplier and number already exists." });
  }

  const status: InvoiceDoc["processingStatus"] = duplicateOf ? "DUPLICATE" : "REVIEW_REQUIRED";
  const res = await Invoice.updateOne(
    { _id: inv._id, jobId, processingStatus: "PROCESSING" },
    {
      $set: {
        ...fields,
        supplierKey,
        invoiceNumberKey,
        validationErrors: issues,
        processingStatus: status,
        isDuplicate: Boolean(duplicateOf),
        duplicateOf,
        extractionProvider: result.provider,
        extractionModel: result.model,
        lastError: null,
        jobId: null,
        approvedAt: null,
      },
    },
  );
  await audit(userId, "job.completed", {
    invoiceId: inv._id,
    jobId,
    message: `${status} with ${issues.length} issue(s)${hasBlockingIssues(issues) ? " (blocking)" : ""}`,
    meta: { provider: result.provider, model: result.model },
  });
  return { applied: res.modifiedCount > 0, status };
}
