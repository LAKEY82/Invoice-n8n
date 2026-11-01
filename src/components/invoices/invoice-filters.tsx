"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { INVOICE_STATUSES } from "@/types/invoice";
import { statusLabel } from "@/components/ui/badge";

export function InvoiceFilters({ suppliers }: { suppliers: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  function set(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  // Debounced search.
  useEffect(() => {
    if (q === (sp.get("q") ?? "")) return;
    const t = setTimeout(() => set({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["q", "status", "supplier", "from", "to"].some((k) => sp.get(k));

  return (
    <div className="mb-4 grid gap-3 rounded-xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
      <div className="relative lg:col-span-2">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input className="pl-9" placeholder="Search number, supplier, file…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search invoices" />
      </div>
      <Select value={sp.get("status") ?? ""} onChange={(e) => set({ status: e.target.value || null })} aria-label="Status filter">
        <option value="">All statuses</option>
        {INVOICE_STATUSES.filter((s) => s !== "PENDING_UPLOAD").map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
      </Select>
      <Select value={sp.get("supplier") ?? ""} onChange={(e) => set({ supplier: e.target.value || null })} aria-label="Supplier filter">
        <option value="">All suppliers</option>
        {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Input type="date" value={sp.get("from") ?? ""} onChange={(e) => set({ from: e.target.value || null })} aria-label="Invoice date from" />
      <div className="flex gap-2">
        <Input type="date" value={sp.get("to") ?? ""} onChange={(e) => set({ to: e.target.value || null })} aria-label="Invoice date to" />
        {active && <Button variant="ghost" size="icon" aria-label="Clear filters" onClick={() => { setQ(""); router.push(pathname); }}><X className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
}
