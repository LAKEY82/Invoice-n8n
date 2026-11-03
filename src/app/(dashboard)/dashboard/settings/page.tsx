import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getTheme } from "@/services/settings.service";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemePicker } from "@/components/settings/theme-picker";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const theme = await getTheme(user.id);
  return (
    <div className="animate-fade-up">
      <PageHeader title="Settings" description="Personalise how InvoiceFlow AI looks for you." />
      <Card className="max-w-3xl">
        <CardHeader><CardTitle>Theme colour</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted">Pick the accent colour used for buttons, highlights and charts. It is saved to your account and applies on every device.</p>
          <ThemePicker initial={theme} />
        </CardContent>
      </Card>
    </div>
  );
}
