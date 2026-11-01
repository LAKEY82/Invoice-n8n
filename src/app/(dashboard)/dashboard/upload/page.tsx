import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { UploadManager } from "@/components/upload/upload-manager";
import { getStorage } from "@/lib/storage/storage.factory";
import { maxUploadBytes } from "@/lib/env";

export const metadata: Metadata = { title: "Upload" };
export const dynamic = "force-dynamic";

export default function UploadPage() {
  const storageReady = getStorage().isConfigured();
  return (
    <div className="animate-fade-up">
      <PageHeader title="Upload invoices" description="Files go straight from your browser to secure storage; extraction runs in the background." />
      {!storageReady && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Cloudflare R2 is not configured on the server, so uploads will fail. Follow <code>docs/R2_SETUP.md</code> and set the R2_* environment variables.
        </p>
      )}
      <UploadManager maxBytes={maxUploadBytes()} />
    </div>
  );
}
