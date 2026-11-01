"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Eye, Trash2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/utils";
import type { InvoiceDTO } from "@/types/invoice";
import type { InvoiceListQuery } from "@/lib/validation/schemas";

interface Props {
  data: { items: InvoiceDTO[]; total: number; page: number; pages: number; pageSize: number };
  query: InvoiceListQuery;
}

const COLUMNS: { key: InvoiceListQuery["sort"] | null; label: string; align?: "right" }[] = [
  { key: "invoiceNumber", label: "Invoice #" },
  { key: "supplierName", label: "Supplier" },
  { key: "invoiceDate", label: "Invoice date" },
  { key: "dueDate", label: "Due date" },
  { key: null, label: "Currency" },
  { key: "total", label: "Total", align: "right" },
  { key: "processingStatus", label: "Status" },
  { key: "createdAt", label: "Created" },
];

export function InvoiceTable({ data, query }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => next.set(k, v));
    router.push(`${pathname}?${next.toString()}`);
  };
  const sortBy = (key: string) => go({ sort: key, dir: query.sort === key && query.dir === "asc" ? "desc" : "asc", page: "1" });

  const allOnPage = data.items.length > 0 && data.items.every((i) => selected.has(i.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(data.items.map((i) => i.id)));

  const exportHref = (format: "csv" | "xlsx", ids?: string[]) => {
    const p = new URLSearchParams(sp.toString());
    p.set("format", format);
    p.delete("page");
    if (ids?.length) p.set("ids", ids.join(","));
    return `/api/exports/invoices?${p.toString()}`;
  };

  async function bulk(action: "delete" | "approve") {
    if (action === "delete" && !confirm(`Delete ${selected.size} invoice(s) and their files? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const r = await api<{ succeeded: number; failed: { reason: string }[] }>("/api/invoices/bulk", { method: "POST", json: { action, ids: [...selected] } });
      toast(r.failed.length ? "error" : "success", `${r.succeeded} ${action === "delete" ? "deleted" : "approved"}${r.failed.length ? `, ${r.failed.length} skipped: ${r.failed[0].reason}` : ""}`);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-navy">{selected.size} selected</span>
            <a href={exportHref("csv", [...selected])}><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> CSV</Button></a>
            <a href={exportHref("xlsx", [...selected])}><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> Excel</Button></a>
            <Button variant="outline" size="sm" onClick={() => bulk("approve")} loading={busy}><CheckCheck className="h-3.5 w-3.5" /> Approve</Button>
            <Button variant="destructive" size="sm" onClick={() => bulk("delete")} loading={busy}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
          </div>
        ) : (
          <span className="text-sm text-muted">Select rows for bulk actions</span>
        )}
        <div className="flex gap-2">
          <a href={exportHref("csv")}><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> Export CSV</Button></a>
          <a href={exportHref("xlsx")}><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> Export Excel</Button></a>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all" checked={allOnPage} onChange={toggleAll} /></th>
              {COLUMNS.map((c) => (
                <th key={c.label} className={`px-3 py-3 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                  {c.key ? (
                    <button className="inline-flex items-center gap-1 hover:text-navy" onClick={() => sortBy(c.key!)}>
                      {c.label}
                      {query.sort === c.key && (query.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  ) : c.label}
                </th>
              ))}
              <th className="px-3 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.items.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 2} className="py-14 text-center text-muted">No invoices found.</td></tr>
            )}
            {data.items.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${i.fileName}`} checked={selected.has(i.id)} onChange={() => toggle(i.id)} /></td>
                <td className="px-3 py-3 font-medium text-navy">{i.invoiceNumber ?? <span className="font-normal text-muted" title={i.fileName}>—</span>}</td>
                <td className="max-w-[200px] truncate px-3 py-3" title={i.supplierName ?? i.fileName}>{i.supplierName ?? <span className="text-muted">{i.fileName}</span>}</td>
                <td className="px-3 py-3">{formatDate(i.invoiceDate)}</td>
                <td className="px-3 py-3">{formatDate(i.dueDate)}</td>
                <td className="px-3 py-3">{i.currency ?? "—"}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{formatMoney(i.total, i.currency)}</td>
                <td className="px-3 py-3"><StatusBadge status={i.processingStatus} /></td>
                <td className="px-3 py-3 text-muted">{formatDate(i.createdAt)}</td>
                <td className="px-3 py-3 text-right">
                  <Link href={`/dashboard/invoices/${i.id}`}><Button variant="ghost" size="sm"><Eye className="h-3.5 w-3.5" /> {i.processingStatus === "REVIEW_REQUIRED" ? "Review" : "View"}</Button></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
        <span>Page {data.page} of {data.pages}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => go({ page: String(data.page - 1) })}><ChevronLeft className="h-4 w-4" /> Prev</Button>
          <Button variant="outline" size="sm" disabled={data.page >= data.pages} onClick={() => go({ page: String(data.page + 1) })}>Next <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </Card>
  );
}
