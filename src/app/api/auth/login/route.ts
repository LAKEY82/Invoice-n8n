import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { route, readJson, clientIp, ApiError } from "@/lib/api/errors";
import { loginSchema } from "@/lib/validation/schemas";
import { connectDB } from "@/lib/mongodb/connect";
import { User } from "@/models/User";
import { setSessionCookie } from "@/lib/auth/session";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

// Compared when the user doesn't exist so response timing doesn't reveal which emails are registered.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("invoiceflow-timing-equalizer", 12));

export const POST = route(async (req) => {
  const ip = clientIp(req);
  const input = loginSchema.parse(await readJson(req));
  await rateLimit("login-ip", ip, 30, 900);
  await rateLimit("login-email", input.email, 8, 900);
  await connectDB();
  const user = await User.findOne({ email: input.email });
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  await setSessionCookie(String(user._id), user.tokenVersion ?? 0);
  return NextResponse.json({ user: { id: String(user._id), name: user.name, email: user.email } });
});
