"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, Loader2, RotateCcw, UploadCloud, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { api, POLL_INTERVAL_MS } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ALLOWED_FILE_TYPES, type InvoiceStatus } from "@/types/invoice";

type Phase = "queued" | "hashing" | "uploading" | "finalizing" | "done" | "error" | "cancelled";
interface Item {
  key: string;
  file: File;
  phase: Phase;
  progress: number;
  error?: string;
  invoiceId?: string;
  status?: InvoiceStatus;
  note?: string;
}

const CONCURRENCY = 2;
const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

async function sha256(file: File) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function UploadManager({ maxBytes }: { maxBytes: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());
  const cancelled = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((key: string, p: Partial<Item>) => setItems((s) => s.map((i) => (i.key === key ? { ...i, ...p } : i))), []);

  const upload = useCallback(
    async (item: Item) => {
      const { key, file } = item;
      cancelled.current.delete(key);
      try {
        patch(key, { phase: "hashing", progress: 0, error: undefined });
        const fileHash = await sha256(file);
        if (cancelled.current.has(key)) return;

        const init = await api<{ invoiceId: string; uploadUrl: string; headers: Record<string, string>; duplicateOf: { fileName: string } | null }>(
          "/api/invoices/upload-url",
          { method: "POST", json: { fileName: file.name, fileType: file.type, fileSize: file.size, fileHash } },
        );
        patch(key, { invoiceId: init.invoiceId, phase: "uploading", note: init.duplicateOf ? `Same file as "${init.duplicateOf.fileName}"` : undefined });

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrs.current.set(key, xhr);
          xhr.open("PUT", init.uploadUrl);
          for (const [h, v] of Object.entries(init.headers)) xhr.setRequestHeader(h, v);
          xhr.upload.onprogress = (e) => e.lengthComputable && patch(key, { progress: Math.round((e.loaded / e.total) * 100) });
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected the upload (HTTP ${xhr.status}). Check the R2 CORS configuration.`)));
          xhr.onerror = () => reject(new Error("Network error while uploading. If this persists, check the R2 bucket CORS settings."));
          xhr.onabort = () => reject(new Error("cancelled"));
          xhr.send(file);
        });
        xhrs.current.delete(key);

        patch(key, { phase: "finalizing", progress: 100 });
        const done = await api<{ invoice: { processingStatus: InvoiceStatus } }>(`/api/invoices/${init.invoiceId}/complete`, { method: "POST" });
        patch(key, { phase: "done", status: done.invoice.processingStatus });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === "cancelled" || cancelled.current.has(key)) patch(key, { phase: "cancelled", error: undefined });
        else patch(key, { phase: "error", error: msg });
      } finally {
        xhrs.current.delete(key);
      }
    },
    [patch],
  );

  // Simple queue: start up to CONCURRENCY queued items.
  useEffect(() => {
    const running = items.filter((i) => ["hashing", "uploading", "finalizing"].includes(i.phase)).length;
    const next = items.filter((i) => i.phase === "queued").slice(0, Math.max(0, CONCURRENCY - running));
    next.forEach((i) => {
      patch(i.key, { phase: "hashing" });
      void upload(i);
    });
  }, [items, patch, upload]);

  // Follow processing status without leaving the page; stops when nothing is in flight.
  const trackedIds = items.filter((i) => i.phase === "done" && i.invoiceId && i.status && ["PENDING", "PROCESSING"].includes(i.status)).map((i) => i.invoiceId!);
  const trackedKey = trackedIds.join(",");
  useEffect(() => {
    if (!trackedKey) return;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const snap = await api<{ items: { id: string; status: InvoiceStatus }[] }>(`/api/invoices/status?ids=${trackedKey}`);
        setItems((s) => s.map((i) => {
          const m = snap.items.find((x) => x.id === i.invoiceId);
          return m ? { ...i, status: m.status } : i;
        }));
      } catch { /* retry next tick */ }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [trackedKey]);

  function addFiles(list: FileList | File[]) {
    const next: Item[] = [];
    for (const file of Array.from(list)) {
      const key = `${file.name}-${file.size}-${crypto.randomUUID()}`;
      let error: string | undefined;
      if (!(ALLOWED_FILE_TYPES as readonly string[]).includes(file.type)) error = "Only PDF, JPG and PNG files are supported.";
      else if (file.size > maxBytes) error = `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`;
      else if (file.size === 0) error = "File is empty.";
      next.push({ key, file, phase: error ? "error" : "queued", progress: 0, error });
    }
    setItems((s) => [...next, ...s]);
  }

  function cancel(key: string) {
    cancelled.current.add(key);
    xhrs.current.get(key)?.abort();
    setItems((s) => s.map((i) => (i.key === key && (i.phase === "queued" || i.phase === "hashing") ? { ...i, phase: "cancelled" } : i)));
  }

  const retry = (key: string) => patch(key, { phase: "queued", error: undefined, progress: 0 });
  const clearFinished = () => setItems((s) => s.filter((i) => !["done", "cancelled"].includes(i.phase)));

  return (
    <div className="space-y-4">
      <Card
        className={cn("border-2 border-dashed transition-colors", dragging ? "border-primary bg-primary/5" : "border-slate-300")}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary-ink"><UploadCloud className="h-6 w-6" /></span>
          <div>
            <p className="font-medium text-navy">Drag and drop invoices here</p>
            <p className="mt-1 text-sm text-muted">PDF, JPG or PNG · up to {Math.round(maxBytes / 1024 / 1024)} MB each · multiple files supported</p>
          </div>
          <input ref={inputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          <Button onClick={() => inputRef.current?.click()}>Choose files</Button>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="text-sm font-medium text-navy">{items.length} file{items.length > 1 ? "s" : ""}</p>
            <Button variant="ghost" size="sm" onClick={clearFinished}>Clear finished</Button>
          </div>
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-3 px-5 py-3">
                <FileText className="h-5 w-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-navy">{i.file.name} <span className="font-normal text-muted">· {fmtSize(i.file.size)}</span></p>
                  {i.phase === "uploading" || i.phase === "hashing" || i.phase === "finalizing" ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={i.progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${i.phase === "hashing" ? 3 : i.progress}%` }} />
                    </div>
                  ) : null}
                  <p className={cn("mt-0.5 text-xs", i.phase === "error" ? "text-red-600" : "text-muted")}>
                    {i.phase === "queued" && "Waiting…"}
                    {i.phase === "hashing" && "Preparing…"}
                    {i.phase === "uploading" && `Uploading ${i.progress}%`}
                    {i.phase === "finalizing" && "Verifying upload…"}
                    {i.phase === "cancelled" && "Cancelled"}
                    {i.phase === "error" && i.error}
                    {i.phase === "done" && (i.status === "DUPLICATE" ? "Identical file already uploaded — marked as duplicate" : "Uploaded — processing continues in the background")}
                    {i.note && i.phase !== "done" ? ` · ${i.note}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {i.phase === "done" && i.status && <StatusBadge status={i.status} />}
                  {i.phase === "done" && !i.status && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                  {i.phase === "done" && i.invoiceId && <Link href={`/dashboard/invoices/${i.invoiceId}`} className="text-xs font-medium text-primary-ink hover:underline">Open</Link>}
                  {i.phase === "error" && i.invoiceId !== undefined && <AlertCircle className="h-4 w-4 text-red-500" />}
                  {(i.phase === "error" || i.phase === "cancelled") && !(i.error?.startsWith("Only") || i.error?.startsWith("File is")) && (
                    <Button variant="outline" size="sm" onClick={() => retry(i.key)}><RotateCcw className="h-3.5 w-3.5" /> Retry</Button>
                  )}
                  {["queued", "hashing", "uploading"].includes(i.phase) && (
                    <Button variant="ghost" size="icon" aria-label="Cancel upload" onClick={() => cancel(i.key)}>
                      {i.phase === "hashing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
