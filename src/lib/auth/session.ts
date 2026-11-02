import { auth, currentUser } from "@clerk/nextjs/server";
import { connectDB } from "@/lib/mongodb/connect";
import { User } from "@/models/User";
import { unauthorized } from "@/lib/api/errors";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Resolves the signed-in Clerk user to the app's own User record (the owner of all invoice data).
 * The record is created on first sign-in; an older account with the same email is adopted so its data stays reachable.
 * Returns null when anonymous.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) return null;
  try {
    await connectDB();
    const existing = await User.findOne({ clerkId: userId }).select("name email").lean();
    if (existing) return { id: String(existing._id), name: existing.name, email: existing.email };

    const cu = await currentUser();
    const email = (cu?.primaryEmailAddress?.emailAddress ?? cu?.emailAddresses[0]?.emailAddress)?.toLowerCase();
    if (!cu || !email) return null;
    const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || email.split("@")[0];

    const doc = await User.findOneAndUpdate(
      { email },
      { $set: { clerkId: userId }, $setOnInsert: { name, email } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean();
    return { id: String(doc!._id), name: doc!.name, email: doc!.email };
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
