import { NextResponse } from "next/server";
import { route, readJson, clientIp } from "@/lib/api/errors";
import { forgotSchema } from "@/lib/validation/schemas";
import { connectDB } from "@/lib/mongodb/connect";
import { User } from "@/models/User";
import { randomToken, sha256Hex } from "@/lib/security/crypto";
import { sendEmail } from "@/lib/email";
import { rateLimit } from "@/lib/security/rate-limit";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  await rateLimit("forgot-ip", clientIp(req), 10, 3600);
  const { email } = forgotSchema.parse(await readJson(req));
  await rateLimit("forgot-email", email, 3, 3600);
  await connectDB();
  const user = await User.findOne({ email });
  if (user) {
    const token = randomToken(32);
    user.passwordResetTokenHash = sha256Hex(token);
    user.passwordResetExpires = new Date(Date.now() + 30 * 60_000);
    await user.save();
    const link = `${env().NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
    await sendEmail(email, "Reset your InvoiceFlow AI password", `Use this link within 30 minutes to reset your password:\n\n${link}\n\nIf you didn't request this, ignore this email.`);
  }
  // Same response whether or not the account exists (prevents account enumeration).
  return NextResponse.json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
});
