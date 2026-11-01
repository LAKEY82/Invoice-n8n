export interface ObjectHead {
  size: number;
  contentType?: string;
}

export interface StorageService {
  /** Short-lived URL the browser PUTs the file to directly. */
  createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /** Short-lived URL for reading the object. `disposition` controls inline preview vs. download. */
  createDownloadUrl(
    key: string,
    expiresInSeconds: number,
    opts?: { disposition?: "inline" | "attachment"; fileName?: string },
  ): Promise<string>;
  /** Returns null when the object does not exist. */
  head(key: string): Promise<ObjectHead | null>;
  /** Reads the first `bytes` bytes (used for magic-number checks). */
  readHead(key: string, bytes: number): Promise<Buffer>;
  delete(key: string): Promise<void>;
  isConfigured(): boolean;
}
