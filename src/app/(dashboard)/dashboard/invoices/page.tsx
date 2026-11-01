import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { invoiceListQuerySchema } from "@/lib/validation/schemas";
import { listInvoices } from "@/services/invoice.service";
import { PageHeader } from "@/components/layout/page-header";
import { InvoiceFilters } from "@/components/invoices/invoice-filters";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { InFlightRefresher } from "@/components/invoices/in-flight-refresher";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== "" && v !== undefined));
  const parsed = invoiceListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : invoiceListQuerySchema.parse({});
  const data = await listInvoices(user.id, query);
  const inFlight = data.items.some((i) => i.processingStatus === "PENDING" || i.processingStatus === "PROCESSING");

  return (
    <div className="animate-fade-up">
      <InFlightRefresher active={inFlight} />
      <PageHeader title="Invoices" description={`${data.total.toLocaleString()} invoice${data.total === 1 ? "" : "s"} match your filters.`} />
      <InvoiceFilters suppliers={data.suppliers} />
      <InvoiceTable data={data} query={query} />
    </div>
  );
}
