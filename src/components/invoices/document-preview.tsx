"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

/**
 * PDFs render in the browser's native viewer (zoom, page navigation, search); images get zoom controls.
 * The signed URL is short-lived, so it is fetched on demand and can be refreshed.
 */
export function DocumentPreview({ invoiceId, fileType, fileName }: { invoiceId: string; fileType: string; fileName: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const [nonce, setNonce] = useState(0);
  const load = useCallback(() => {
    setError(null);
    setUrl(null);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ url: string }>(`/api/invoices/${invoiceId}/download`)
      .then((r) => !cancelled && setUrl(r.url))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [invoiceId, nonce]);

  async function download() {
    try {
      const r = await api<{ url: string }>(`/api/invoices/${invoiceId}/download?disposition=attachment`);
      window.location.assign(r.url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const isPdf = fileType === "application/pdf";

  return (
    <div className="flex h-[70vh] min-h-[480px] flex-col overflow-hidden rounded-xl border border-border bg-white lg:h-[calc(100vh-9rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="truncate text-sm font-medium text-navy" title={fileName}>{fileName}</p>
        <div className="flex items-center gap-1">
          {!isPdf && (
            <>
              <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><ZoomOut className="h-4 w-4" /></Button>
              <span className="w-10 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}><ZoomIn className="h-4 w-4" /></Button>
            </>
          )}
          <Button variant="ghost" size="icon" aria-label="Refresh preview" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={download}><Download className="h-3.5 w-3.5" /> Download</Button>
        </div>
      </div>
      <div className="relative flex-1 overflow-auto bg-slate-100">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-red-600">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          </div>
        ) : !url ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : isPdf ? (
          <iframe title={`Preview of ${fileName}`} src={`${url}#toolbar=1&navpanes=0`} className="h-full w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Invoice ${fileName}`} className="mx-auto origin-top transition-[width]" style={{ width: `${zoom * 100}%`, maxWidth: "none" }} />
        )}
      </div>
    </div>
  );
}
