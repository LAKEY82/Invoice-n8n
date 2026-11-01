import { connectDB } from "@/lib/mongodb/connect";
import { RateLimit } from "@/models/RateLimit";
import { ApiError } from "@/lib/api/errors";

/**
 * Fixed-window limiter backed by MongoDB (works across serverless instances).
 * Throws a 429 ApiError when the limit is exceeded.
 */
export async function rateLimit(bucket: string, id: string, limit: number, windowSeconds: number) {
  await connectDB();
  const windowStart = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `${bucket}:${id}:${windowStart}`;
  const doc = await RateLimit.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((windowStart + 1) * windowSeconds * 1000 + 60_000) } },
    { upsert: true, new: true },
  );
  if (doc.count > limit) {
    const retry = Math.max(1, (windowStart + 1) * windowSeconds - Math.floor(Date.now() / 1000));
    throw new ApiError(429, "Too many requests. Please slow down.", "RATE_LIMITED", { "Retry-After": String(retry) });
  }
}
