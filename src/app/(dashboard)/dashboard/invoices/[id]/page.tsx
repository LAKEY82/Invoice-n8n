import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getInvoice } from "@/services/invoice.service";
import { ApiError } from "@/lib/api/errors";
import { ReviewWorkspace } from "@/components/invoices/review-workspace";
import { InFlightRefresher } from "@/components/invoices/in-flight-refresher";
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
      <ReviewWorkspace key={`${invoice.id}-${invoice.updatedAt}`} invoice={invoice} />
    </div>
  );
}
