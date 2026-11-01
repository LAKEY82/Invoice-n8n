import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/mongodb/connect";
import { Invoice, type InvoiceDoc } from "@/models/Invoice";
import { BusinessSettings } from "@/models/BusinessSettings";
import { maxUploadBytes } from "@/lib/env";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { checkInvoice, hasBlockingIssues } from "@/lib/validation/invoice-checks";
import type { InvoiceListQuery, InvoiceUpdateInput } from "@/lib/validation/schemas";
import { normalizeKey } from "@/lib/utils";
import type { InvoiceDTO } from "@/types/invoice";
import { assertKeyOwnedBy, buildObjectKey, deleteObjectSafe, uploadUrl, verifyUploadedObject } from "@/services/storage.service";
import { dispatchInvoice } from "@/services/processing.service";
import { audit } from "@/services/audit.service";
import { getStorage } from "@/lib/storage/storage.factory";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toDTO(i: InvoiceDoc): InvoiceDTO {
  return {
    id: String(i._id),
    supplierName: i.supplierName,
    supplierAddress: i.supplierAddress,
    supplierTaxId: i.supplierTaxId,
    invoiceNumber: i.invoiceNumber,
    invoiceDate: iso(i.invoiceDate),
    dueDate: iso(i.dueDate),
    currency: i.currency,
    subtotal: i.subtotal,
    tax: i.tax,
    discount: i.discount,
    total: i.total,
    lineItems: (i.lineItems ?? []).map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount })),
    fileName: i.fileName,
    fileType: i.fileType,
    fileSize: i.fileSize,
    fileHash: i.fileHash,
    processingStatus: i.processingStatus,
    processingAttempts: i.processingAttempts,
    lastError: i.lastError,
    validationErrors: (i.validationErrors ?? []).map((v) => ({ code: v.code, message: v.message, severity: v.severity, field: v.field })),
    isDuplicate: i.isDuplicate,
    duplicateOf: i.duplicateOf ? String(i.duplicateOf) : null,
    extractionProvider: i.extractionProvider,
    extractionModel: i.extractionModel,
    approvedAt: iso(i.approvedAt),
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every query is scoped by the authenticated user's id. */
export function buildFilter(userId: string, q: Partial<InvoiceListQuery>): QueryFilter<InvoiceDoc> {
  const f: QueryFilter<InvoiceDoc> = { userId, processingStatus: { $ne: "PENDING_UPLOAD" } };
  if (q.status) f.processingStatus = q.status;
  if (q.supplier) f.supplierName = { $regex: `^${escapeRegex(q.supplier)}$`, $options: "i" };
  if (q.q) {
    const rx = { $regex: escapeRegex(q.q), $options: "i" };
    f.$or = [{ invoiceNumber: rx }, { supplierName: rx }, { fileName: rx }];
  }
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from && !isNaN(Date.parse(q.from))) range.$gte = new Date(q.from);
    if (q.to && !isNaN(Date.parse(q.to))) range.$lte = new Date(new Date(q.to).getTime() + 86_399_999);
    if (Object.keys(range).length) f.invoiceDate = range;
  }
  return f;
}

export async function listInvoices(userId: string, q: InvoiceListQuery) {
  await connectDB();
  const filter = buildFilter(userId, q);
  const [items, total, suppliers] = await Promise.all([
    Invoice.find(filter)
      .sort({ [q.sort]: q.dir === "asc" ? 1 : -1, _id: -1 })
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean(),
    Invoice.countDocuments(filter),
    Invoice.distinct("supplierName", { userId, supplierName: { $ne: null } }),
  ]);
  return {
    items: items.map(toDTO),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.max(1, Math.ceil(total / q.pageSize)),
    suppliers: (suppliers as string[]).sort((a, b) => a.localeCompare(b)).slice(0, 200),
  };
}

export async function getInvoiceDoc(userId: string, id: string) {
  await connectDB();
  if (!/^[a-f0-9]{24}$/.test(id)) throw notFound("Invoice not found");
  const inv = await Invoice.findOne({ _id: id, userId }).lean();
  if (!inv) throw notFound("Invoice not found");
  return inv;
}

export async function getInvoice(userId: string, id: string) {
  return toDTO(await getInvoiceDoc(userId, id));
}

/* ------------------------------ upload flow ------------------------------ */

export async function createUpload(userId: string, input: { fileName: string; fileType: string; fileSize: number; fileHash: string }) {
  await connectDB();
  if (!getStorage().isConfigured()) throw badRequest("File storage (Cloudflare R2) is not configured on the server.", "STORAGE_NOT_CONFIGURED");
  if (input.fileSize > maxUploadBytes()) throw badRequest(`File exceeds the ${maxUploadBytes() / 1024 / 1024} MB limit`, "FILE_TOO_LARGE");

  const existing = await Invoice.findOne({ userId, fileHash: input.fileHash, processingStatus: { $nin: ["PENDING_UPLOAD", "FAILED"] } })
    .select("_id fileName")
    .lean();

  const key = buildObjectKey(userId, input.fileType);
  const invoice = await Invoice.create({
    userId,
    r2ObjectKey: key,
    fileName: input.fileName.replace(/[\u0000-\u001f]/g, ""),
    fileType: input.fileType,
    fileSize: input.fileSize,
    fileHash: input.fileHash,
    processingStatus: "PENDING_UPLOAD",
  });
  const url = await uploadUrl(key, input.fileType);
  await audit(userId, "upload.started", { invoiceId: invoice._id, meta: { size: input.fileSize } });
  return {
    invoiceId: String(invoice._id),
    uploadUrl: url,
    method: "PUT" as const,
    headers: { "Content-Type": input.fileType },
    duplicateOf: existing ? { id: String(existing._id), fileName: existing.fileName } : null,
  };
}

export async function completeUpload(userId: string, id: string) {
  await connectDB();
  const inv = await Invoice.findOne({ _id: id, userId });
  if (!inv) throw notFound("Invoice not found");
  if (inv.processingStatus !== "PENDING_UPLOAD") return { invoice: toDTO(inv.toObject()), alreadyCompleted: true };
  assertKeyOwnedBy(userId, inv.r2ObjectKey);

  const check = await verifyUploadedObject(inv.r2ObjectKey, inv.fileType, inv.fileSize, maxUploadBytes());
  if (!check.ok) {
    await deleteObjectSafe(inv.r2ObjectKey);
    await Invoice.deleteOne({ _id: inv._id });
    await audit(userId, "upload.rejected", { invoiceId: inv._id, level: "warn", message: check.reason });
    throw badRequest(check.reason, "UPLOAD_INVALID");
  }

  // Identical file already stored → don't spend AI quota; user can still force a reprocess.
  const same = inv.fileHash
    ? await Invoice.findOne({ userId, fileHash: inv.fileHash, _id: { $ne: inv._id }, processingStatus: { $nin: ["PENDING_UPLOAD", "FAILED"] } })
        .select("_id")
        .sort({ createdAt: 1 })
        .lean()
    : null;
  if (same) {
    inv.processingStatus = "DUPLICATE";
    inv.isDuplicate = true;
    inv.duplicateOf = same._id;
    inv.validationErrors = [{ code: "DUPLICATE_FILE", severity: "warning", message: "This exact file was uploaded before." }];
    await inv.save();
    await audit(userId, "upload.duplicate_file", { invoiceId: inv._id, message: `Same SHA-256 as ${same._id}` });
    return { invoice: toDTO(inv.toObject()), alreadyCompleted: false };
  }

  inv.processingStatus = "PENDING";
  await inv.save();
  await audit(userId, "upload.completed", { invoiceId: inv._id });
  await dispatchInvoice(inv._id); // never throws on n8n failure — leaves the invoice PENDING with a retry scheduled
  const fresh = await Invoice.findById(inv._id).lean();
  return { invoice: toDTO(fresh!), alreadyCompleted: false };
}

/* ------------------------------ review actions ------------------------------ */

function toDocFields(input: InvoiceUpdateInput) {
  return {
    ...input,
    invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    supplierKey: normalizeKey(input.supplierName) || null,
    invoiceNumberKey: normalizeKey(input.invoiceNumber) || null,
  };
}

const EDITABLE: InvoiceDoc["processingStatus"][] = ["REVIEW_REQUIRED", "DUPLICATE", "FAILED", "APPROVED"];

export async function updateInvoice(userId: string, id: string, input: InvoiceUpdateInput) {
  await connectDB();
  const current = await getInvoiceDoc(userId, id);
  if (!EDITABLE.includes(current.processingStatus)) throw conflict("This invoice cannot be edited while it is being processed.");
  const settings = await BusinessSettings.findOne({ userId }).lean();
  const issues = checkInvoice(input, settings?.totalsTolerance ?? 0.02);
  // Keep the duplicate warning visible while the invoice is still flagged.
  if (current.isDuplicate) issues.push({ code: "DUPLICATE_INVOICE", severity: "warning", message: "Flagged as a duplicate of another invoice." });

  // Editing an approved invoice sends it back to review.
  const status = current.processingStatus === "APPROVED" ? "REVIEW_REQUIRED" : current.processingStatus === "FAILED" ? "REVIEW_REQUIRED" : current.processingStatus;
  const updated = await Invoice.findOneAndUpdate(
    { _id: id, userId },
    { $set: { ...toDocFields(input), validationErrors: issues, processingStatus: status, approvedAt: null, lastError: null } },
    { new: true },
  ).lean();
  await audit(userId, "invoice.edited", { invoiceId: id });
  return toDTO(updated!);
}

export async function approveInvoice(userId: string, id: string, acknowledgeWarnings: boolean) {
  await connectDB();
  const inv = await getInvoiceDoc(userId, id);
  if (!["REVIEW_REQUIRED", "DUPLICATE"].includes(inv.processingStatus)) throw conflict("Only invoices awaiting review can be approved.");
  const settings = await BusinessSettings.findOne({ userId }).lean();
  const issues = checkInvoice(inv, settings?.totalsTolerance ?? 0.02);
  if (hasBlockingIssues(issues) && !acknowledgeWarnings) {
    throw conflict(`Cannot approve: ${issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}. Fix the fields or confirm the override.`);
  }
  if (inv.isDuplicate && !acknowledgeWarnings) throw conflict("This invoice is flagged as a duplicate. Confirm the override to approve it anyway.");
  const updated = await Invoice.findOneAndUpdate(
    { _id: id, userId },
    { $set: { processingStatus: "APPROVED", approvedAt: new Date(), isDuplicate: false, duplicateOf: null, validationErrors: issues } },
    { new: true },
  ).lean();
  await audit(userId, "invoice.approved", { invoiceId: id, level: hasBlockingIssues(issues) ? "warn" : "info", message: hasBlockingIssues(issues) ? "Approved with acknowledged errors" : "" });
  return toDTO(updated!);
}

export async function markDuplicate(userId: string, id: string) {
  await connectDB();
  const inv = await getInvoiceDoc(userId, id);
  if (!EDITABLE.includes(inv.processingStatus)) throw conflict("Invoice is still processing.");
  const updated = await Invoice.findOneAndUpdate({ _id: id, userId }, { $set: { processingStatus: "DUPLICATE", isDuplicate: true, approvedAt: null } }, { new: true }).lean();
  await audit(userId, "invoice.marked_duplicate", { invoiceId: id });
  return toDTO(updated!);
}

export async function rejectInvoice(userId: string, id: string) {
  await connectDB();
  const inv = await getInvoiceDoc(userId, id);
  if (!EDITABLE.includes(inv.processingStatus)) throw conflict("Invoice is still processing.");
  const updated = await Invoice.findOneAndUpdate(
    { _id: id, userId },
    { $set: { processingStatus: "FAILED", lastError: "Rejected by reviewer", approvedAt: null } },
    { new: true },
  ).lean();
  await audit(userId, "invoice.rejected", { invoiceId: id });
  return toDTO(updated!);
}

export async function deleteInvoice(userId: string, id: string) {
  await connectDB();
  const inv = await Invoice.findOneAndDelete({ _id: id, userId, processingStatus: { $nin: ["PROCESSING"] } }).lean();
  if (!inv) throw notFound("Invoice not found or is currently processing");
  await deleteObjectSafe(inv.r2ObjectKey);
  await audit(userId, "invoice.deleted", { invoiceId: id, meta: { fileName: inv.fileName } });
}

export async function bulkAction(userId: string, action: "delete" | "approve", ids: string[]) {
  const results = { succeeded: 0, failed: [] as { id: string; reason: string }[] };
  for (const id of ids) {
    try {
      if (action === "delete") await deleteInvoice(userId, id);
      else await approveInvoice(userId, id, false); // bulk approval never overrides validation errors
      results.succeeded++;
    } catch (e) {
      results.failed.push({ id, reason: (e as Error).message });
    }
  }
  return results;
}

export async function statusSnapshot(userId: string, ids?: string[]) {
  await connectDB();
  const filter: QueryFilter<InvoiceDoc> = { userId };
  if (ids?.length) filter._id = { $in: ids.filter((i) => /^[a-f0-9]{24}$/.test(i)).slice(0, 100) };
  else filter.processingStatus = { $in: ["PENDING_UPLOAD", "PENDING", "PROCESSING"] };
  const rows = await Invoice.find(filter).select("processingStatus lastError processingAttempts updatedAt").limit(100).lean();
  const active = await Invoice.countDocuments({ userId, processingStatus: { $in: ["PENDING", "PROCESSING"] } });
  return {
    items: rows.map((r) => ({ id: String(r._id), status: r.processingStatus, lastError: r.lastError, attempts: r.processingAttempts, updatedAt: r.updatedAt })),
    activeCount: active,
  };
}
