import ExcelJS from "exceljs";
import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/mongodb/connect";
import { Invoice, type InvoiceDoc } from "@/models/Invoice";
import type { ReportData } from "@/services/report.service";

export type ExportFormat = "csv" | "xlsx";
export interface ExportFile {
  body: Buffer;
  contentType: string;
  fileName: string;
}

const MAX_ROWS = 5000;
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Neutralise spreadsheet formula injection (=, +, -, @, tab, CR) in user/AI-controlled text. */
function safeText(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): Buffer {
  const esc = (v: string | number | null) => {
    const s = typeof v === "number" ? String(v) : safeText(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return Buffer.from("﻿" + text, "utf8"); // BOM so Excel reads UTF-8 correctly
}

async function toXlsx(sheets: { name: string; headers: string[]; rows: (string | number | null)[][]; moneyCols?: number[] }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "InvoiceFlow AI";
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRow(s.headers).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    for (const r of s.rows) ws.addRow(r.map((v) => (typeof v === "string" ? safeText(v) : v)));
    ws.columns.forEach((c, i) => {
      c.width = Math.min(40, Math.max(12, s.headers[i].length + 4));
      if (s.moneyCols?.includes(i)) c.numFmt = "#,##0.00";
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function build(
  format: ExportFormat,
  base: string,
  sheets: { name: string; headers: string[]; rows: (string | number | null)[][]; moneyCols?: number[] }[],
): Promise<ExportFile> {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    return { body: await toXlsx(sheets), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName: `${base}-${stamp}.xlsx` };
  }
  return { body: toCsv(sheets[0].headers, sheets[0].rows), contentType: "text/csv; charset=utf-8", fileName: `${base}-${stamp}.csv` };
}

/** Generated in memory and streamed back — nothing is written to disk or R2. */
export async function exportInvoices(userId: string, filter: QueryFilter<InvoiceDoc>, format: ExportFormat) {
  await connectDB();
  const invoices = await Invoice.find({ ...filter, userId }).sort({ createdAt: -1 }).limit(MAX_ROWS).lean();
  const headers = ["Invoice Number", "Supplier", "Supplier Tax ID", "Invoice Date", "Due Date", "Currency", "Subtotal", "Tax", "Discount", "Total", "Status", "File", "Created"];
  const rows = invoices.map((i) => [i.invoiceNumber, i.supplierName, i.supplierTaxId, iso(i.invoiceDate), iso(i.dueDate), i.currency, i.subtotal, i.tax, i.discount, i.total, i.processingStatus, i.fileName, iso(i.createdAt)]);
  const sheets = [{ name: "Invoices", headers, rows, moneyCols: [6, 7, 8, 9] }];
  if (format === "xlsx") {
    sheets.push({
      name: "Line Items",
      headers: ["Invoice Number", "Supplier", "Description", "Quantity", "Unit Price", "Amount"],
      rows: invoices.flatMap((i) => (i.lineItems ?? []).map((l) => [i.invoiceNumber, i.supplierName, l.description, l.quantity, l.unitPrice, l.amount])),
      moneyCols: [4, 5],
    });
  }
  return build(format, "invoices", sheets);
}

export async function exportReport(report: ReportData, format: ExportFormat) {
  const sheets = [
    { name: "Monthly Spending", headers: ["Month", "Currency", "Invoices", "Total"], rows: report.monthly.map((m) => [m.month, m.currency, m.count, m.total]), moneyCols: [3] },
    { name: "Suppliers", headers: ["Supplier", "Currency", "Invoices", "Total", "Tax"], rows: report.suppliers.map((s) => [s.supplier, s.currency, s.count, s.total, s.tax]), moneyCols: [3, 4] },
    { name: "Tax Summary", headers: ["Month", "Currency", "Subtotal", "Tax", "Total"], rows: report.tax.map((t) => [t.month, t.currency, t.subtotal, t.tax, t.total]), moneyCols: [2, 3, 4] },
    { name: "Status Summary", headers: ["Status", "Invoices"], rows: report.statuses.map((s) => [s.status, s.count]) },
    { name: "Totals", headers: ["Currency", "Invoices", "Subtotal", "Tax", "Discount", "Total"], rows: report.totals.map((t) => [t.currency, t.count, t.subtotal, t.tax, t.discount, t.total]), moneyCols: [2, 3, 4, 5] },
  ];
  // CSV carries a single table, so use the supplier breakdown (most requested); XLSX carries every sheet.
  return build(format, "report", format === "csv" ? [sheets[1]] : sheets);
}

export function fileResponse(f: ExportFile) {
  return new Response(new Uint8Array(f.body), {
    headers: {
      "Content-Type": f.contentType,
      "Content-Disposition": `attachment; filename="${f.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
