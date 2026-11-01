import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/types/invoice";

const STATUS_STYLES: Record<InvoiceStatus, { label: string; cls: string }> = {
  PENDING_UPLOAD: { label: "Uploading", cls: "bg-slate-100 text-slate-700" },
  PENDING: { label: "Queued", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  PROCESSING: { label: "Processing", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  REVIEW_REQUIRED: { label: "Review required", cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  APPROVED: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  FAILED: { label: "Failed", cls: "bg-red-50 text-red-700 ring-red-200" },
  DUPLICATE: { label: "Duplicate", cls: "bg-purple-50 text-purple-700 ring-purple-200" },
};

export const statusLabel = (s: InvoiceStatus) => STATUS_STYLES[s].label;

export function StatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent", s.cls, className)}>
      {(status === "PROCESSING" || status === "PENDING") && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {s.label}
    </span>
  );
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700", className)} {...props} />;
}
