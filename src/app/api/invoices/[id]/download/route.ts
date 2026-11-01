import { NextResponse } from "next/server";
import { route } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/session";
import { getInvoiceDoc } from "@/services/invoice.service";
import { assertKeyOwnedBy, downloadUrl } from "@/services/storage.service";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** ?disposition=attachment for download, default inline for preview. Returns a short-lived signed URL. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const user = await requireUser();
  const inv = await getInvoiceDoc(user.id, (await params).id);
  assertKeyOwnedBy(user.id, inv.r2ObjectKey);
  const disposition = new URL(req.url).searchParams.get("disposition") === "attachment" ? "attachment" : "inline";
  const url = await downloadUrl(inv.r2ObjectKey, inv.fileName, disposition);
  return NextResponse.json({ url, fileType: inv.fileType, expiresInSeconds: env().DOWNLOAD_URL_TTL_SECONDS });
});
