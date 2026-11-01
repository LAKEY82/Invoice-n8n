import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "@/lib/env";

// mongodb+srv:// needs SRV lookups; some machines/networks point Node at a resolver that refuses them
// (symptom: "querySrv ECONNREFUSED"). DNS_SERVERS=8.8.8.8,1.1.1.1 overrides Node's resolvers.
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean));
}
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { __mongoose?: Cache };
const cache: Cache = (g.__mongoose ??= { conn: null, promise: null });

/** Cached connection — safe for serverless where modules are re-evaluated per cold start. */
export async function connectDB() {
  if (cache.conn) return cache.conn;
  cache.promise ??= mongoose.connect(env().MONGODB_URI, {
    bufferCommands: false,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }
  return cache.conn;
}
