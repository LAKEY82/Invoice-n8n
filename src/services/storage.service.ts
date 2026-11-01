import { randomUUID } from "crypto";
import { getStorage } from "@/lib/storage/storage.factory";
import { env } from "@/lib/env";
import { FILE_EXTENSIONS } from "@/types/invoice";

/** Keys are namespaced per user: invoices/<userId>/<yyyy-mm>/<uuid>.<ext> */
export function buildObjectKey(userId: string, fileType: string) {
  const ym = new Date().toISOString().slice(0, 7);
  return `invoices/${userId}/${ym}/${randomUUID()}.${FILE_EXTENSIONS[fileType] ?? "bin"}`;
}

export const userPrefix = (userId: string) => `invoices/${userId}/`;

export function assertKeyOwnedBy(userId: string, key: string) {
  if (!key.startsWith(userPrefix(userId)) || key.includes("..")) throw new Error("Object key does not belong to user");
}

export const uploadUrl = (key: string, type: string) => getStorage().createUploadUrl(key, type, env().UPLOAD_URL_TTL_SECONDS);

export const downloadUrl = (key: string, fileName: string, disposition: "inline" | "attachment" = "inline") =>
  getStorage().createDownloadUrl(key, env().DOWNLOAD_URL_TTL_SECONDS, { disposition, fileName });

/** Best-effort deletion: a failure must not block deleting the DB record, but is logged for cleanup. */
export async function deleteObjectSafe(key: string) {
  try {
    await getStorage().delete(key);
    return true;
  } catch (e) {
    console.error("[storage] failed to delete object", key, e);
    return false;
  }
}

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  "image/png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

/** Verifies the uploaded object exists, matches the declared size, and has the right file signature. */
export async function verifyUploadedObject(key: string, declaredType: string, declaredSize: number, maxBytes: number) {
  const storage = getStorage();
  const head = await storage.head(key);
  if (!head) return { ok: false as const, reason: "The file was not found in storage. Upload it again." };
  if (head.size > maxBytes) return { ok: false as const, reason: "File exceeds the maximum allowed size." };
  if (head.size !== declaredSize) return { ok: false as const, reason: "Uploaded file size does not match what was declared." };
  const bytes = await storage.readHead(key, 8);
  if (!MAGIC[declaredType]?.(bytes)) return { ok: false as const, reason: "File contents do not match the declared file type." };
  return { ok: true as const };
}
