import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code = "BAD_REQUEST") => new ApiError(400, m, code);
export const unauthorized = (m = "Authentication required") => new ApiError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "Forbidden") => new ApiError(403, m, "FORBIDDEN");
export const notFound = (m = "Not found") => new ApiError(404, m, "NOT_FOUND");
export const conflict = (m: string) => new ApiError(409, m, "CONFLICT");

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: converts thrown errors into safe JSON responses. */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status, headers: err.headers });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Validation failed",
            code: "VALIDATION_ERROR",
            issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 422 },
        );
      }
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}`, err);
      return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
