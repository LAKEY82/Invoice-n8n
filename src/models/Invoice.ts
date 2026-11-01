import { Schema, model, models, type Model, type Types } from "mongoose";
import { INVOICE_STATUSES } from "@/types/invoice";

const lineItemSchema = new Schema(
  {
    description: { type: String, default: null },
    quantity: { type: Number, default: null },
    unitPrice: { type: Number, default: null },
    amount: { type: Number, default: null },
  },
  { _id: false },
);

const issueSchema = new Schema(
  {
    code: String,
    message: String,
    severity: { type: String, enum: ["error", "warning"] },
    field: String,
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    supplierName: { type: String, default: null },
    supplierAddress: { type: String, default: null },
    supplierTaxId: { type: String, default: null },
    invoiceNumber: { type: String, default: null },
    invoiceDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    currency: { type: String, default: null },
    subtotal: { type: Number, default: null },
    tax: { type: Number, default: null },
    discount: { type: Number, default: null },
    total: { type: Number, default: null },
    lineItems: { type: [lineItemSchema], default: [] },

    // Normalized copies used only for duplicate detection.
    supplierKey: { type: String, default: null },
    invoiceNumberKey: { type: String, default: null },

    r2ObjectKey: { type: String, required: true },
    fileName: { type: String, required: true },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileHash: { type: String, default: null },

    processingStatus: { type: String, enum: INVOICE_STATUSES, default: "PENDING_UPLOAD" },
    validationErrors: { type: [issueSchema], default: [] },
    isDuplicate: { type: Boolean, default: false },
    duplicateOf: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },

    extractionProvider: { type: String, default: null },
    extractionModel: { type: String, default: null },
    approvedAt: { type: Date, default: null },

    // Processing job bookkeeping (idempotency / retry / concurrency control).
    jobId: { type: String, default: null },
    processingAttempts: { type: Number, default: 0 },
    processingStartedAt: { type: Date, default: null },
    nextRetryAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

invoiceSchema.index({ userId: 1, invoiceDate: -1 });
invoiceSchema.index({ userId: 1, processingStatus: 1 });
invoiceSchema.index({ userId: 1, fileHash: 1 });
invoiceSchema.index({ userId: 1, supplierKey: 1, invoiceNumberKey: 1 });
invoiceSchema.index({ userId: 1, createdAt: -1 });
invoiceSchema.index({ jobId: 1 }, { sparse: true });

export interface InvoiceDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  supplierName: string | null;
  supplierAddress: string | null;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  dueDate: Date | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  total: number | null;
  lineItems: { description: string | null; quantity: number | null; unitPrice: number | null; amount: number | null }[];
  supplierKey: string | null;
  invoiceNumberKey: string | null;
  r2ObjectKey: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string | null;
  processingStatus: (typeof INVOICE_STATUSES)[number];
  validationErrors: { code: string; message: string; severity: "error" | "warning"; field?: string }[];
  isDuplicate: boolean;
  duplicateOf: Types.ObjectId | null;
  extractionProvider: string | null;
  extractionModel: string | null;
  approvedAt: Date | null;
  jobId: string | null;
  processingAttempts: number;
  processingStartedAt: Date | null;
  nextRetryAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Invoice: Model<InvoiceDoc> =
  (models.Invoice as Model<InvoiceDoc>) || model<InvoiceDoc>("Invoice", invoiceSchema);
