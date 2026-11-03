"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, Plug, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import type { listIntegrations } from "@/services/integration.service";

type Data = Awaited<ReturnType<typeof listIntegrations>>;
const NAMES = { gemini: "Google Gemini", openai: "OpenAI" } as const;

function Status({ ok, label }: { ok: boolean | null; label: string }) {
  const I = ok === null ? CircleDashed : ok ? CheckCircle2 : XCircle;
  const c = ok === null ? "text-slate-500 bg-slate-100" : ok ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}><I className="h-3.5 w-3.5" />{label}</span>;
}

export function IntegrationsPanel({ data }: { data: Data }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [n8nResult, setN8nResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function act(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try { await fn(); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(null); }
  }

  const save = (p: string) => act(`save-${p}`, async () => {
    const r = await api<{ test: { ok: boolean; message: string } }>(`/api/integrations/${p}`, { method: "PUT", json: { apiKey: keys[p], model: models[p] || null } });
    setKeys((k) => ({ ...k, [p]: "" }));
    toast(r.test.ok ? "success" : "error", r.test.ok ? "Key saved and verified" : `Key saved, but verification failed: ${r.test.message}`);
    router.refresh();
  });
  const test = (p: string) => act(`test-${p}`, async () => {
    const r = await api<{ ok: boolean; message: string }>(`/api/integrations/${p}/test`, { method: "POST" });
    if (p === "n8n") setN8nResult(r);
    toast(r.ok ? "success" : "error", r.message);
    router.refresh();
  });
  const remove = (p: string) => act(`rm-${p}`, async () => {
    if (!confirm("Remove the stored key? Processing will fall back to the server key if one exists.")) return;
    await api(`/api/integrations/${p}`, { method: "DELETE" });
    router.refresh();
  });
  const prefer = (p: string) => act("prefer", async () => {
    await api("/api/integrations", { method: "PATCH", json: { preferredProvider: p } });
    router.refresh();
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>n8n processing workflow</CardTitle><Status ok={data.n8n.configured ? (n8nResult?.ok ?? null) : false} label={!data.n8n.configured ? "Not configured" : n8nResult ? (n8nResult.ok ? "Reachable" : "Unreachable") : "Not tested"} /></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data.n8n.configured ? <p className="text-muted">Webhook host: <code>{data.n8n.webhookHost}</code>. Configured through server environment variables.</p> : <p className="text-muted">Set <code>N8N_WEBHOOK_URL</code> and <code>N8N_API_SECRET</code> on the server (see docs/N8N_RENDER_DEPLOYMENT.md).</p>}
          {n8nResult && <p className={n8nResult.ok ? "text-emerald-700" : "text-red-700"}>{n8nResult.message}</p>}
          <Button variant="outline" onClick={() => test("n8n")} loading={busy === "test-n8n"} disabled={!data.n8n.configured}><Plug className="h-4 w-4" /> Test connection</Button>
          <p className="text-xs text-muted">A free Render instance may take up to a minute to wake the first time.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>File storage (Cloudflare R2)</CardTitle><Status ok={data.storage.configured} label={data.storage.configured ? "Configured" : "Not configured"} /></CardHeader>
        <CardContent className="text-sm text-muted">Managed with server environment variables (R2_*). Credentials are never exposed to the browser. See docs/R2_SETUP.md.</CardContent>
      </Card>

      {data.ai.map((a) => (
        <Card key={a.provider}>
          <CardHeader>
            <CardTitle>{NAMES[a.provider]}{data.preferredProvider === a.provider && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary-ink">PREFERRED</span>}</CardTitle>
            <Status ok={a.configured ? a.lastTestOk : false} label={!a.configured ? "No key" : a.lastTestOk === null ? (a.source === "environment" ? "Server key (untested)" : "Not tested") : a.lastTestOk ? "Key verified" : "Verification failed"} />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted">
              {a.source === "user" && <>Your key <code>{a.keyHint}</code> is stored encrypted. Model: <code>{a.model}</code>.</>}
              {a.source === "environment" && <>Using the server-wide key <code>{a.keyHint}</code>. Model: <code>{a.model}</code>. Save your own key below to override it.</>}
              {a.source === "none" && <>No key configured. Extraction cannot run with this provider.</>}
              {a.lastTestedAt && <> Last checked {formatDate(a.lastTestedAt)}{a.lastTestMessage ? ` — ${a.lastTestMessage}` : ""}.</>}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2"><Label htmlFor={`k-${a.provider}`}>API key</Label><Input id={`k-${a.provider}`} type="password" autoComplete="off" placeholder={a.source === "user" ? "Enter a new key to replace" : "Paste API key"} value={keys[a.provider] ?? ""} onChange={(e) => setKeys({ ...keys, [a.provider]: e.target.value })} /></div>
              <div><Label htmlFor={`m-${a.provider}`}>Model (optional)</Label><Input id={`m-${a.provider}`} placeholder={a.model} value={models[a.provider] ?? ""} onChange={(e) => setModels({ ...models, [a.provider]: e.target.value })} /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(a.provider)} loading={busy === `save-${a.provider}`} disabled={(keys[a.provider] ?? "").trim().length < 8}>Save key</Button>
              <Button variant="outline" onClick={() => test(a.provider)} loading={busy === `test-${a.provider}`} disabled={!a.configured}>Test</Button>
              {data.preferredProvider !== a.provider && <Button variant="outline" onClick={() => prefer(a.provider)} loading={busy === "prefer"} disabled={!a.configured}>Make preferred</Button>}
              {a.source === "user" && <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => remove(a.provider)} loading={busy === `rm-${a.provider}`}>Remove</Button>}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader><CardTitle>Google Sheets</CardTitle><Status ok={null} label="Not available" /></CardHeader>
        <CardContent className="text-sm text-muted">{data.googleSheets.note}</CardContent>
      </Card>
    </div>
  );
}
