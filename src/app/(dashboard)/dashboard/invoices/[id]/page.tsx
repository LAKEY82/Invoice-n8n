import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getInvoice } from "@/services/invoice.service";
import { ApiError } from "@/lib/api/errors";
import { ReviewWorkspace } from "@/components/invoices/review-workspace";
import { InFlightRefresher } from "@/components/invoices/in-flight-refresher";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/utils";
import type { InvoiceDTO } from "@/types/invoice";

export const metadata: Metadata = { title: "Review invoice" };
export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let invoice: InvoiceDTO;
  try {
    invoice = await getInvoice(user.id, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const active = ["PENDING", "PROCESSING", "PENDING_UPLOAD"].includes(invoice.processingStatus);

  return (
    <div className="animate-fade-up">
      <InFlightRefresher active={active} />
      <Link href="/dashboard/invoices" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" /> Back to invoices
      </Link>

      <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#111827] to-[#1f2937] p-6 text-white shadow-card md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-400">Supplier</p>
            <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{invoice.supplierName ?? invoice.fileName}</h1>
            <p className="mt-1 max-w-md truncate text-sm text-slate-300">{invoice.supplierAddress ?? "Address not extracted"}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{formatMoney(invoice.total, invoice.currency)}</p>
            <div className="mt-2 sm:flex sm:justify-end"><StatusBadge status={invoice.processingStatus} /></div>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-400">Invoice number</dt><dd className="mt-0.5 truncate font-medium">{invoice.invoiceNumber ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-400">Issued</dt><dd className="mt-0.5 font-medium">{invoice.invoiceDate ? formatDate(invoice.invoiceDate) : "—"}</dd></div>
          <div><dt className="text-xs text-slate-400">Due</dt><dd className="mt-0.5 font-medium">{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</dd></div>
          <div><dt className="text-xs text-slate-400">Currency</dt><dd className="mt-0.5 font-medium">{invoice.currency ?? "—"}</dd></div>
        </dl>
      </section>

      <ReviewWorkspace key={`${invoice.id}-${invoice.updatedAt}`} invoice={invoice} />
    </div>
  );
}
