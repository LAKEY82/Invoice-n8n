import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { route, readJson, clientIp, conflict } from "@/lib/api/errors";
import { registerSchema } from "@/lib/validation/schemas";
import { connectDB } from "@/lib/mongodb/connect";
import { User } from "@/models/User";
import { BusinessSettings } from "@/models/BusinessSettings";
import { setSessionCookie } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  await rateLimit("register", clientIp(req), 10, 3600);
  const input = registerSchema.parse(await readJson(req));
  await connectDB();
  if (await User.exists({ email: input.email })) throw conflict("An account with this email already exists");
  const passwordHash = await bcrypt.hash(input.password, 12);
  let user;
  try {
    user = await User.create({ name: input.name, email: input.email, passwordHash });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw conflict("An account with this email already exists");
    throw e;
  }
  await BusinessSettings.create({ userId: user._id });
  await setSessionCookie(String(user._id), user.tokenVersion ?? 0);
  return NextResponse.json({ user: { id: String(user._id), name: user.name, email: user.email } }, { status: 201 });
});
