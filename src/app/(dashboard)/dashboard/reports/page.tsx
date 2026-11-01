import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { buildReport } from "@/services/report.service";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { SpendChart } from "@/components/reports/spend-chart";
import { statusLabel } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";
import type { InvoiceStatus } from "@/types/invoice";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const from = one(sp.from), to = one(sp.to), approvedOnly = one(sp.scope) === "approved";
  const report = await buildReport(user.id, { from, to, approvedOnly });
  const currency = one(sp.currency) && report.currencies.includes(one(sp.currency)!) ? one(sp.currency)! : report.primaryCurrency;

  const exportQs = (format: string) => new URLSearchParams({ format, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(approvedOnly ? { approvedOnly: "true" } : {}) }).toString();
  const totals = report.totals.find((t) => t.currency === currency);
  const monthly = report.monthly.filter((m) => m.currency === currency);
  const suppliers = report.suppliers.filter((s) => s.currency === currency);
  const tax = report.tax.filter((t) => t.currency === currency);

  const th = "px-4 py-2.5 font-medium";
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        title="Reports"
        description={approvedOnly ? "Approved invoices only." : "Approved and awaiting-review invoices (excludes failed and duplicates)."}
        actions={
          <>
            <a href={`/api/exports/reports?${exportQs("csv")}`}><Button variant="outline"><Download className="h-4 w-4" /> CSV (suppliers)</Button></a>
            <a href={`/api/exports/reports?${exportQs("xlsx")}`}><Button><Download className="h-4 w-4" /> Excel (all sheets)</Button></a>
          </>
        }
      />

      <form method="get" className="grid gap-3 rounded-xl border border-border bg-white p-4 sm:grid-cols-5">
        <div><Label htmlFor="from">From</Label><Input id="from" name="from" type="date" defaultValue={from} /></div>
        <div><Label htmlFor="to">To</Label><Input id="to" name="to" type="date" defaultValue={to} /></div>
        <div><Label htmlFor="scope">Scope</Label><Select id="scope" name="scope" defaultValue={approvedOnly ? "approved" : "all"}><option value="all">All extracted</option><option value="approved">Approved only</option></Select></div>
        <div><Label htmlFor="currency">Currency</Label><Select id="currency" name="currency" defaultValue={currency}>{(report.currencies.length ? report.currencies : [currency]).map((c) => <option key={c}>{c}</option>)}</Select></div>
        <div className="flex items-end"><Button type="submit" className="w-full">Apply</Button></div>
      </form>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Invoices", String(totals?.count ?? 0)],
          ["Subtotal", formatMoney(totals?.subtotal ?? 0, currency)],
          ["Tax", formatMoney(totals?.tax ?? 0, currency)],
          ["Total", formatMoney(totals?.total ?? 0, currency)],
        ].map(([l, v]) => (
          <Card key={l}><CardContent className="p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-xl font-semibold text-navy">{v}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Monthly spending ({currency})</CardTitle></CardHeader>
        <CardContent className="h-72"><SpendChart data={monthly} currency={currency} /></CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Supplier report</CardTitle></CardHeader>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className={th}>Supplier</th><th className={`${th} text-right`}>Invoices</th><th className={`${th} text-right`}>Tax</th><th className={`${th} text-right`}>Total</th></tr></thead>
              <tbody className="divide-y divide-border">
                {suppliers.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-muted">No data for this period.</td></tr>}
                {suppliers.map((s) => <tr key={s.supplier}><td className="max-w-[220px] truncate px-4 py-2.5">{s.supplier}</td><td className="px-4 py-2.5 text-right">{s.count}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(s.tax, currency)}</td><td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatMoney(s.total, currency)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tax summary</CardTitle></CardHeader>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className={th}>Month</th><th className={`${th} text-right`}>Subtotal</th><th className={`${th} text-right`}>Tax</th><th className={`${th} text-right`}>Total</th></tr></thead>
              <tbody className="divide-y divide-border">
                {tax.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-muted">No data for this period.</td></tr>}
                {tax.map((t) => <tr key={t.month}><td className="px-4 py-2.5">{t.month}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(t.subtotal, currency)}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(t.tax, currency)}</td><td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatMoney(t.total, currency)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Status summary (all invoices in range)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {report.statuses.length === 0 && <p className="text-sm text-muted">No invoices in this period.</p>}
          {report.statuses.map((s) => <div key={s.status}><p className="text-xs text-muted">{statusLabel(s.status as InvoiceStatus)}</p><p className="text-xl font-semibold text-navy">{s.count}</p></div>)}
        </CardContent>
      </Card>
    </div>
  );
}
