import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { route, readJson, clientIp, badRequest } from "@/lib/api/errors";
import { resetSchema } from "@/lib/validation/schemas";
import { connectDB } from "@/lib/mongodb/connect";
import { User } from "@/models/User";
import { sha256Hex } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  await rateLimit("reset-ip", clientIp(req), 20, 3600);
  const { token, password } = resetSchema.parse(await readJson(req));
  await connectDB();
  const user = await User.findOne({
    passwordResetTokenHash: sha256Hex(token),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) throw badRequest("This reset link is invalid or has expired", "INVALID_TOKEN");
  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // invalidates existing sessions
  await user.save();
  return NextResponse.json({ ok: true });
});
