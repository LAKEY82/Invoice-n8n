import { R2StorageService } from "./r2-storage.service";
import type { StorageService } from "./storage.interface";

let instance: StorageService | null = null;

/** Single place to swap providers (S3, MinIO, …) later — callers only see StorageService. */
export function getStorage(): StorageService {
  instance ??= new R2StorageService({
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET_NAME,
    endpoint: process.env.R2_ENDPOINT,
  });
  return instance;
}
