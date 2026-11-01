import { env } from "@/lib/env";

/**
 * Sends mail through Resend's HTTP API (free tier available) when RESEND_API_KEY is set.
 * Without it, the message is only logged in development. In production it is NOT sent and a warning is logged.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const e = env();
  if (e.RESEND_API_KEY && e.EMAIL_FROM) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to, subject, text }),
    });
    if (!res.ok) console.error("[email] Resend rejected the message", res.status, await res.text());
    return res.ok;
  }
  if (e.NODE_ENV !== "production") {
    console.info(`[email:dev] To: ${to}\nSubject: ${subject}\n${text}`);
  } else {
    console.warn("[email] RESEND_API_KEY / EMAIL_FROM not configured — password reset email was not sent");
  }
  return false;
}
