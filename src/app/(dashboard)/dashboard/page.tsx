import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Copy, FileText, Loader2, Receipt, Upload, XCircle, Clock } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getDashboard } from "@/services/dashboard.service";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCharts } from "@/components/dashboard/charts";
import { CurrencySelect } from "@/components/dashboard/currency-select";
import { InFlightRefresher } from "@/components/invoices/in-flight-refresher";
import { formatDate, formatMoney } from "@/lib/utils";
import { getStorage } from "@/lib/storage/storage.factory";
import { n8nConfigured } from "@/lib/n8n/client";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ currency?: string | string[] }> }) {
  const user = await requireUser();
  const { currency } = await searchParams;
  const data = await getDashboard(user.id, Array.isArray(currency) ? currency[0] : currency);
  const s = data.stats;
  const missing = [!getStorage().isConfigured() && "Cloudflare R2 storage", !n8nConfigured() && "n8n processing"].filter(Boolean);

  const cards = [
    { label: "Total Invoices", value: s.totalInvoices.toLocaleString(), icon: FileText, tone: "text-primary bg-primary/10" },
    { label: "Total Invoice Value", value: formatMoney(s.totalValue, data.currency), icon: Receipt, tone: "text-indigo-600 bg-indigo-50", note: data.otherCurrencyCount
        ? `${data.otherCurrencyCount} invoice${data.otherCurrencyCount > 1 ? "s" : ""} not converted (no exchange rate)`
        : data.rateDate ? `Converted at exchange rates of ${data.rateDate}` : undefined },
    { label: "Processed Invoices", value: s.processed.toLocaleString(), icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Pending Review", value: s.pendingReview.toLocaleString(), icon: Clock, tone: "text-orange-600 bg-orange-50" },
    { label: "Failed Processing", value: s.failed.toLocaleString(), icon: XCircle, tone: "text-red-600 bg-red-50" },
    { label: "Duplicate Invoices", value: s.duplicates.toLocaleString(), icon: Copy, tone: "text-purple-600 bg-purple-50" },
  ];

  return (
    <div className="animate-fade-up">
      <InFlightRefresher active={s.inFlight > 0} />
      <PageHeader
        title="Dashboard"
        description="Live overview of your invoice pipeline."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <CurrencySelect value={data.currency} options={data.currencies} />
            <Link href="/dashboard/upload"><Button><Upload className="h-4 w-4" /> Upload invoices</Button></Link>
          </div>
        }
      />

      {missing.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>Setup incomplete:</strong> {missing.join(" and ")} {missing.length > 1 ? "are" : "is"} not configured on the server, so uploads and AI extraction are unavailable. See the setup guides in <code>/docs</code>.
          </p>
        </div>
      )}

      {s.inFlight > 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Loader2 className="h-4 w-4 animate-spin" /> {s.inFlight} invoice{s.inFlight > 1 ? "s are" : " is"} being processed. This page updates automatically.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <span className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${c.tone}`}><c.icon className="h-4 w-4" /></span>
              <p className="text-xs text-muted">{c.label}</p>
              <p className="mt-1 truncate text-xl font-semibold text-navy">{c.value}</p>
              {c.note && <p className="mt-0.5 text-[11px] text-muted">{c.note}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <DashboardCharts data={data} />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <Link href="/dashboard/invoices" className="text-xs font-medium text-primary hover:underline">View all</Link>
        </CardHeader>
        {data.recent.length === 0 ? (
          <CardContent className="py-10 text-center text-sm text-muted">No invoices yet. Upload your first invoice to get started.</CardContent>
        ) : (
          <ul className="divide-y divide-border">
            {data.recent.map((i) => (
              <li key={i.id}>
                <Link href={`/dashboard/invoices/${i.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy">{i.supplierName ?? i.fileName}</p>
                    <p className="truncate text-xs text-muted">{i.invoiceNumber ? `#${i.invoiceNumber} · ` : ""}{formatDate(i.updatedAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="hidden text-sm text-navy sm:block">{formatMoney(i.total, i.currency)}</span>
                    <StatusBadge status={i.processingStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
