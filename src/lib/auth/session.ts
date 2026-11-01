import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { connectDB } from "@/lib/mongodb/connect";
import { User } from "@/models/User";
import { unauthorized } from "@/lib/api/errors";

export const SESSION_COOKIE = "invoiceflow_session";
const MAX_AGE = 60 * 60 * 24 * 7;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

const secret = () => new TextEncoder().encode(env().JWT_SECRET);

export async function createSessionToken(userId: string, tokenVersion: number) {
  return new SignJWT({ tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function setSessionCookie(userId: string, tokenVersion: number) {
  const token = await createSessionToken(userId, tokenVersion);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Validates the cookie against the database; returns null when anonymous. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    await connectDB();
    const user = await User.findById(payload.sub).select("name email tokenVersion").lean();
    if (!user || (user.tokenVersion ?? 0) !== payload.tv) return null;
    return { id: String(user._id), name: user.name, email: user.email };
  } catch {
    return null;
  }
}

/** For route handlers: the user id always comes from the verified session, never from the client. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}
