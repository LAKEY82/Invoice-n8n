import { connectDB } from "@/lib/mongodb/connect";
import { BusinessSettings } from "@/models/BusinessSettings";
import { DEFAULT_THEME, isTheme, type ThemeId } from "@/lib/theme";

export async function getTheme(userId: string): Promise<ThemeId> {
  await connectDB();
  const s = await BusinessSettings.findOne({ userId }).select("themeColor").lean();
  return isTheme(s?.themeColor) ? s.themeColor : DEFAULT_THEME;
}

export async function setTheme(userId: string, theme: ThemeId) {
  await connectDB();
  await BusinessSettings.updateOne({ userId }, { $set: { themeColor: theme } }, { upsert: true });
}
