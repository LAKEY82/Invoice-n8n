"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { AlertTriangle, CheckCircle2, Copy, Info, Loader2, Plus, RefreshCw, Save, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { DocumentPreview } from "@/components/invoices/document-preview";
import { api } from "@/lib/api-client";
import { checkInvoice, hasBlockingIssues } from "@/lib/validation/invoice-checks";
import type { InvoiceDTO, ValidationIssue } from "@/types/invoice";

interface FormValues {
  supplierName: string;
  supplierAddress: string;
  supplierTaxId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  lineItems: { description: string; quantity: string; unitPrice: string; amount: string }[];
}

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const day = (v: string | null) => (v ? v.slice(0, 10) : "");
const num = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? null : Number(v));
const txt = (v: string) => (v.trim() === "" ? null : v.trim());

function toForm(i: InvoiceDTO): FormValues {
  return {
    supplierName: str(i.supplierName), supplierAddress: str(i.supplierAddress), supplierTaxId: str(i.supplierTaxId),
    invoiceNumber: str(i.invoiceNumber), invoiceDate: day(i.invoiceDate), dueDate: day(i.dueDate), currency: str(i.currency),
    subtotal: str(i.subtotal), tax: str(i.tax), discount: str(i.discount), total: str(i.total),
    lineItems: i.lineItems.map((l) => ({ description: str(l.description), quantity: str(l.quantity), unitPrice: str(l.unitPrice), amount: str(l.amount) })),
  };
}

function toPayload(v: FormValues) {
  return {
    supplierName: txt(v.supplierName), supplierAddress: txt(v.supplierAddress), supplierTaxId: txt(v.supplierTaxId),
    invoiceNumber: txt(v.invoiceNumber), invoiceDate: txt(v.invoiceDate), dueDate: txt(v.dueDate),
    currency: txt(v.currency)?.toUpperCase() ?? null,
    subtotal: num(v.subtotal), tax: num(v.tax), discount: num(v.discount), total: num(v.total),
    lineItems: v.lineItems.map((l) => ({ description: txt(l.description), quantity: num(l.quantity), unitPrice: num(l.unitPrice), amount: num(l.amount) })),
  };
}

export function ReviewWorkspace({ invoice }: { invoice: InvoiceDTO }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const form = useForm<FormValues>({ defaultValues: toForm(invoice) });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lineItems" });
  const watched = useWatch({ control: form.control }) as FormValues;

  const state = invoice.processingStatus;
  const inFlight = ["PENDING", "PROCESSING", "PENDING_UPLOAD"].includes(state);
  const dirty = form.formState.isDirty;

  // Live validation on the current (unsaved) values.
  const liveIssues: ValidationIssue[] = useMemo(() => {
    if (inFlight || !watched?.lineItems) return invoice.validationErrors;
    const p = toPayload(watched);
    const issues = checkInvoice(p);
    if (invoice.isDuplicate) issues.push({ code: "DUPLICATE_INVOICE", severity: "warning", message: "Flagged as a duplicate of another invoice." });
    return issues;
  }, [watched, inFlight, invoice.validationErrors, invoice.isDuplicate]);
  const blocking = hasBlockingIssues(liveIssues);

  async function run<T>(label: string, fn: () => Promise<T>, success: string) {
    setBusy(label);
    try {
      await fn();
      toast("success", success);
      router.refresh();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const save = () => run("save", () => api(`/api/invoices/${invoice.id}`, { method: "PATCH", json: toPayload(form.getValues()) }), "Changes saved");

  async function approve() {
    const problems = [...liveIssues.filter((i) => i.severity === "error").map((i) => i.message), ...(invoice.isDuplicate ? ["This invoice is flagged as a duplicate"] : [])];
    if (problems.length && !confirm(`This invoice has unresolved problems:\n\n• ${problems.join("\n• ")}\n\nApprove anyway?`)) return;
    await run("approve", async () => {
      if (dirty) await api(`/api/invoices/${invoice.id}`, { method: "PATCH", json: toPayload(form.getValues()) });
      await api(`/api/invoices/${invoice.id}/approve`, { method: "POST", json: { acknowledgeWarnings: problems.length > 0 } });
    }, "Invoice approved");
  }

  const simple = (label: string, path: string, msg: string, confirmText?: string) => async () => {
    if (confirmText && !confirm(confirmText)) return;
    await run(label, () => api(`/api/invoices/${invoice.id}/${path}`, { method: "POST" }), msg);
  };

  async function remove_() {
    if (!confirm("Delete this invoice and its stored file permanently?")) return;
    setBusy("delete");
    try {
      await api(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      router.replace("/dashboard/invoices");
      router.refresh();
    } catch (e) {
      toast("error", (e as Error).message);
      setBusy(null);
    }
  }

  const reviewable = ["REVIEW_REQUIRED", "DUPLICATE", "FAILED", "APPROVED"].includes(state);
  const errFields = new Set(liveIssues.filter((i) => i.severity === "error").map((i) => i.field?.split(".")[0]));
  const ring = (f: string) => (errFields.has(f) ? "border-red-400 ring-2 ring-red-100" : "");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:sticky lg:top-6 lg:self-start">
        <DocumentPreview invoiceId={invoice.id} fileType={invoice.fileType} fileName={invoice.fileName} />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle className="truncate">{invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : invoice.fileName}</CardTitle>
              <p className="mt-0.5 text-xs text-muted">
                {invoice.extractionProvider ? `Extracted by ${invoice.extractionProvider} · ${invoice.extractionModel}` : "Not extracted yet"}
                {invoice.processingAttempts > 0 && ` · ${invoice.processingAttempts} attempt${invoice.processingAttempts > 1 ? "s" : ""}`}
              </p>
            </div>
            <StatusBadge status={state} />
          </CardHeader>
          {(inFlight || invoice.lastError) && (
            <CardContent className="space-y-2 pb-0">
              {inFlight && (
                <p className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {state === "PROCESSING" ? "Extracting data… this page updates automatically." : "Queued. If the processing service is waking up this can take a minute; retries are automatic."}
                </p>
              )}
              {invoice.lastError && (
                <p className="flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{invoice.lastError}</p>
              )}
            </CardContent>
          )}
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={save} loading={busy === "save"} disabled={!reviewable || !dirty || !!busy}><Save className="h-4 w-4" /> Save changes</Button>
            <Button variant="success" onClick={approve} loading={busy === "approve"} disabled={!reviewable || state === "APPROVED" || !!busy}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
            <Button variant="outline" onClick={simple("dup", "duplicate", "Marked as duplicate")} loading={busy === "dup"} disabled={!reviewable || state === "DUPLICATE" || !!busy}><Copy className="h-4 w-4" /> Mark duplicate</Button>
            <Button variant="outline" onClick={simple("reject", "reject", "Invoice rejected", "Reject this invoice?")} loading={busy === "reject"} disabled={!reviewable || !!busy}><XCircle className="h-4 w-4" /> Reject</Button>
            <Button variant="outline" onClick={simple("reprocess", "reprocess", "Reprocessing started", "Re-run AI extraction? Your manual edits will be replaced.")} loading={busy === "reprocess"} disabled={inFlight && state !== "PENDING" || !!busy}><RefreshCw className="h-4 w-4" /> Reprocess</Button>
            <Button variant="ghost" onClick={remove_} loading={busy === "delete"} disabled={state === "PROCESSING" || !!busy} className="ml-auto text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</Button>
          </CardContent>
        </Card>

        {!inFlight && liveIssues.length > 0 && (
          <Card className={blocking ? "border-red-200" : "border-amber-200"}>
            <CardContent className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <AlertTriangle className={blocking ? "h-4 w-4 text-red-600" : "h-4 w-4 text-amber-600"} />
                {blocking ? "Needs attention before approval" : "Warnings"}
              </p>
              <ul className="space-y-1.5">
                {liveIssues.map((i, k) => (
                  <li key={k} className={`flex gap-2 text-sm ${i.severity === "error" ? "text-red-700" : "text-amber-800"}`}>
                    {i.severity === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    {i.message}
                  </li>
                ))}
              </ul>
              {invoice.isDuplicate && invoice.duplicateOf && (
                <a href={`/dashboard/invoices/${invoice.duplicateOf}`} className="inline-block text-sm font-medium text-primary hover:underline">View the original invoice →</a>
              )}
            </CardContent>
          </Card>
        )}

        <fieldset disabled={!reviewable || !!busy} className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Supplier</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label htmlFor="supplierName">Name</Label><Input id="supplierName" className={ring("supplierName")} {...form.register("supplierName")} /></div>
              <div className="sm:col-span-2"><Label htmlFor="supplierAddress">Address</Label><Textarea id="supplierAddress" {...form.register("supplierAddress")} /></div>
              <div><Label htmlFor="supplierTaxId">Tax ID</Label><Input id="supplierTaxId" {...form.register("supplierTaxId")} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Invoice details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="invoiceNumber">Invoice number</Label><Input id="invoiceNumber" className={ring("invoiceNumber")} {...form.register("invoiceNumber")} /></div>
              <div><Label htmlFor="currency">Currency (ISO)</Label><Input id="currency" maxLength={3} placeholder="USD" className={ring("currency")} {...form.register("currency")} /></div>
              <div><Label htmlFor="invoiceDate">Invoice date</Label><Input id="invoiceDate" type="date" className={ring("invoiceDate")} {...form.register("invoiceDate")} /></div>
              <div><Label htmlFor="dueDate">Due date</Label><Input id="dueDate" type="date" className={ring("dueDate")} {...form.register("dueDate")} /></div>
              {(["subtotal", "tax", "discount", "total"] as const).map((f) => (
                <div key={f}>
                  <Label htmlFor={f} className="capitalize">{f}</Label>
                  <Input id={f} type="number" step="0.01" className={ring(f)} {...form.register(f)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line items ({fields.length})</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ description: "", quantity: "", unitPrice: "", amount: "" })}><Plus className="h-3.5 w-3.5" /> Add line</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.length === 0 && <p className="text-sm text-muted">No line items.</p>}
              {fields.map((f, idx) => (
                <div key={f.id} className="grid grid-cols-12 gap-2 rounded-lg border border-border p-3">
                  <div className="col-span-12"><Label>Description</Label><Input {...form.register(`lineItems.${idx}.description`)} /></div>
                  <div className="col-span-4"><Label>Qty</Label><Input type="number" step="any" {...form.register(`lineItems.${idx}.quantity`)} /></div>
                  <div className="col-span-4"><Label>Unit price</Label><Input type="number" step="any" {...form.register(`lineItems.${idx}.unitPrice`)} /></div>
                  <div className="col-span-3"><Label>Amount</Label><Input type="number" step="any" {...form.register(`lineItems.${idx}.amount`)} /></div>
                  <div className="col-span-1 flex items-end"><Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => remove(idx)}><Trash2 className="h-4 w-4 text-slate-500" /></Button></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </fieldset>
      </div>
    </div>
  );
}
