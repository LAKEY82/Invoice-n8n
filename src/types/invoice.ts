export const INVOICE_STATUSES = [
  "PENDING_UPLOAD",
  "PENDING",
  "PROCESSING",
  "REVIEW_REQUIRED",
  "APPROVED",
  "FAILED",
  "DUPLICATE",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Statuses during which the UI should keep polling. */
export const ACTIVE_STATUSES: InvoiceStatus[] = ["PENDING_UPLOAD", "PENDING", "PROCESSING"];

export const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const FILE_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export interface LineItemDTO {
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  field?: string;
}

export interface InvoiceDTO {
  id: string;
  supplierName: string | null;
  supplierAddress: string | null;
  supplierTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  total: number | null;
  lineItems: LineItemDTO[];
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string | null;
  processingStatus: InvoiceStatus;
  processingAttempts: number;
  lastError: string | null;
  validationErrors: ValidationIssue[];
  isDuplicate: boolean;
  duplicateOf: string | null;
  extractionProvider: string | null;
  extractionModel: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
