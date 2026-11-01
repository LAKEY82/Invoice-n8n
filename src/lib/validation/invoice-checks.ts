import type { ValidationIssue } from "@/types/invoice";

interface Checkable {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | Date | null;
  dueDate: string | Date | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  total: number | null;
  lineItems: { description: string | null; quantity: number | null; unitPrice: number | null; amount: number | null }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Deterministic sanity checks. Any "error" severity forces human review.
 * Missing values are flagged, never guessed.
 */
export function checkInvoice(inv: Checkable, tolerance = 0.02): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string, field?: string) => issues.push({ code, message, severity: "error", field });
  const warn = (code: string, message: string, field?: string) => issues.push({ code, message, severity: "warning", field });

  if (!inv.supplierName) err("MISSING_SUPPLIER", "Supplier name is missing", "supplierName");
  if (!inv.invoiceNumber) err("MISSING_NUMBER", "Invoice number is missing", "invoiceNumber");
  if (!inv.invoiceDate) err("MISSING_DATE", "Invoice date is missing", "invoiceDate");
  if (inv.total === null) err("MISSING_TOTAL", "Total is missing", "total");
  if (!inv.currency) warn("MISSING_CURRENCY", "Currency is missing", "currency");
  if (inv.lineItems.length === 0) warn("NO_LINE_ITEMS", "No line items were extracted", "lineItems");

  if (inv.total !== null && inv.total < 0) warn("NEGATIVE_TOTAL", "Total is negative (credit note?)", "total");

  if (inv.invoiceDate && inv.dueDate && new Date(inv.dueDate) < new Date(inv.invoiceDate)) {
    err("DUE_BEFORE_INVOICE", "Due date is earlier than the invoice date", "dueDate");
  }
  if (inv.invoiceDate && new Date(inv.invoiceDate) > new Date(Date.now() + 86_400_000 * 2)) {
    warn("FUTURE_DATE", "Invoice date is in the future", "invoiceDate");
  }

  inv.lineItems.forEach((li, i) => {
    if (li.quantity !== null && li.unitPrice !== null && li.amount !== null) {
      const expected = r2(li.quantity * li.unitPrice);
      if (Math.abs(expected - li.amount) > Math.max(tolerance, Math.abs(expected) * 0.005)) {
        warn("LINE_MISMATCH", `Line ${i + 1}: quantity × unit price (${expected}) differs from amount (${li.amount})`, `lineItems.${i}`);
      }
    }
  });

  const lineSum = inv.lineItems.every((l) => l.amount !== null) && inv.lineItems.length > 0
    ? r2(inv.lineItems.reduce((s, l) => s + (l.amount ?? 0), 0))
    : null;

  if (lineSum !== null && inv.subtotal !== null && Math.abs(lineSum - inv.subtotal) > tolerance + 0.005) {
    err("SUBTOTAL_MISMATCH", `Line items sum to ${lineSum} but subtotal is ${inv.subtotal}`, "subtotal");
  }

  const base = inv.subtotal ?? lineSum;
  if (base !== null && inv.total !== null) {
    const expected = r2(base + (inv.tax ?? 0) - (inv.discount ?? 0));
    if (Math.abs(expected - inv.total) > tolerance + 0.005) {
      err("TOTAL_MISMATCH", `Subtotal + tax − discount = ${expected}, but total is ${inv.total}`, "total");
    }
  }
  return issues;
}

export const hasBlockingIssues = (issues: ValidationIssue[]) => issues.some((i) => i.severity === "error");
