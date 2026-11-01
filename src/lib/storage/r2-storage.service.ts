import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectHead, StorageService } from "./storage.interface";

export interface R2Config {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucket?: string;
  endpoint?: string;
}

export class R2StorageService implements StorageService {
  private client: S3Client | null = null;

  constructor(private cfg: R2Config) {}

  isConfigured() {
    const c = this.cfg;
    return Boolean(c.accessKeyId && c.secretAccessKey && c.bucket && (c.endpoint || c.accountId));
  }

  private s3() {
    if (!this.isConfigured()) {
      throw new Error("Cloudflare R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME).");
    }
    this.client ??= new S3Client({
      region: "auto",
      endpoint: this.cfg.endpoint || `https://${this.cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: this.cfg.accessKeyId!, secretAccessKey: this.cfg.secretAccessKey! },
      // R2 rejects the optional CRC32 checksum headers newer SDK versions add to presigned requests.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    return this.client;
  }

  private get Bucket() {
    return this.cfg.bucket!;
  }

  createUploadUrl(key: string, contentType: string, expiresInSeconds: number) {
    return getSignedUrl(this.s3(), new PutObjectCommand({ Bucket: this.Bucket, Key: key, ContentType: contentType }), {
      expiresIn: expiresInSeconds,
    });
  }

  createDownloadUrl(
    key: string,
    expiresInSeconds: number,
    opts: { disposition?: "inline" | "attachment"; fileName?: string } = {},
  ) {
    const name = (opts.fileName ?? "invoice").replace(/[^\w.\- ]/g, "_");
    return getSignedUrl(
      this.s3(),
      new GetObjectCommand({
        Bucket: this.Bucket,
        Key: key,
        ResponseContentDisposition: `${opts.disposition ?? "inline"}; filename="${name}"`,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const r = await this.s3().send(new HeadObjectCommand({ Bucket: this.Bucket, Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType };
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async readHead(key: string, bytes: number) {
    const r = await this.s3().send(new GetObjectCommand({ Bucket: this.Bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async delete(key: string) {
    await this.s3().send(new DeleteObjectCommand({ Bucket: this.Bucket, Key: key }));
  }
}
