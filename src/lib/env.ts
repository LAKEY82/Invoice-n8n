import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),

  N8N_WEBHOOK_URL: z.string().optional(),
  N8N_API_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  N8N_DISPATCH_TIMEOUT_MS: z.coerce.number().default(8000),
  PROCESSING_MAX_ATTEMPTS: z.coerce.number().default(5),
  PROCESSING_TIMEOUT_MINUTES: z.coerce.number().default(10),

  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  MAX_UPLOAD_MB: z.coerce.number().default(10),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().default(300),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().default(300),
  NEXT_PUBLIC_POLL_INTERVAL_MS: z.coerce.number().default(7000),

});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server environment. Throws a readable error when required values are missing. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const maxUploadBytes = () => env().MAX_UPLOAD_MB * 1024 * 1024;
