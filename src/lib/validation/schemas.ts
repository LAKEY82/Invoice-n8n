import { z } from "zod";
import { ALLOWED_FILE_TYPES, INVOICE_STATUSES } from "@/types/invoice";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128)
    .regex(/[a-zA-Z]/, "Include a letter")
    .regex(/[0-9]/, "Include a number"),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: registerSchema.shape.password,
});

export const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileType: z.enum(ALLOWED_FILE_TYPES),
  fileSize: z.number().int().positive(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/, "fileHash must be a SHA-256 hex digest"),
});

const nullableStr = z.string().trim().max(500).nullable();
const nullableNum = z.number().finite().nullable();
const nullableDate = z
  .string()
  .nullable()
  .refine((v) => v === null || !isNaN(Date.parse(v)), "Invalid date");

export const lineItemSchema = z.object({
  description: z.string().max(1000).nullable(),
  quantity: nullableNum,
  unitPrice: nullableNum,
  amount: nullableNum,
});

/** Fields a human may edit on the review screen. */
export const invoiceUpdateSchema = z.object({
  supplierName: nullableStr,
  supplierAddress: z.string().max(1000).nullable(),
  supplierTaxId: z.string().max(100).nullable(),
  invoiceNumber: z.string().max(100).nullable(),
  invoiceDate: nullableDate,
  dueDate: nullableDate,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code")
    .nullable(),
  subtotal: nullableNum,
  tax: nullableNum,
  discount: nullableNum,
  total: nullableNum,
  lineItems: z.array(lineItemSchema).max(200),
});
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;

/** What the AI must return. Lenient on shape (strings/numbers), strict on nulls for missing data. */
export const extractionSchema = z.object({
  supplierName: z.string().nullable().default(null),
  supplierAddress: z.string().nullable().default(null),
  supplierTaxId: z.string().nullable().default(null),
  invoiceNumber: z.string().nullable().default(null),
  invoiceDate: z.string().nullable().default(null),
  dueDate: z.string().nullable().default(null),
  currency: z.string().nullable().default(null),
  subtotal: z.number().nullable().default(null),
  tax: z.number().nullable().default(null),
  discount: z.number().nullable().default(null),
  total: z.number().nullable().default(null),
  lineItems: z
    .array(
      z.object({
        description: z.string().nullable().default(null),
        quantity: z.number().nullable().default(null),
        unitPrice: z.number().nullable().default(null),
        amount: z.number().nullable().default(null),
      }),
    )
    .default([]),
});
export type Extraction = z.infer<typeof extractionSchema>;

export const jobResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    extraction: z.unknown(),
    provider: z.string().max(50),
    model: z.string().max(100),
  }),
  z.object({
    status: z.literal("error"),
    error: z.string().max(2000),
    /** true → n8n hit a transient problem (rate limit, timeout); Next.js will retry with backoff. */
    retryable: z.boolean().default(false),
  }),
]);

export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  supplier: z.string().trim().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["createdAt", "invoiceDate", "dueDate", "total", "supplierName", "invoiceNumber", "processingStatus"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const bulkSchema = z.object({
  action: z.enum(["delete", "approve"]),
  ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).min(1).max(100),
});

export const integrationSaveSchema = z.object({
  apiKey: z.string().trim().min(8).max(500),
  model: z.string().trim().max(100).optional().nullable(),
});
