import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getTheme } from "@/services/settings.service";
import { AppShell } from "@/components/layout/sidebar";
import { ToastProvider } from "@/components/ui/toast";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const theme = await getTheme(user.id);
  return (
    <div data-app-theme data-theme={theme} className="min-h-screen">
      <ToastProvider>
        <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>
      </ToastProvider>
    </div>
  );
}
