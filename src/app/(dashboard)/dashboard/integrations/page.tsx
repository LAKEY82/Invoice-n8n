import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { listIntegrations } from "@/services/integration.service";
import { PageHeader } from "@/components/layout/page-header";
import { IntegrationsPanel } from "@/components/integrations/integrations-panel";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireUser();
  const data = await listIntegrations(user.id);
  return (
    <div className="animate-fade-up">
      <PageHeader title="Integrations" description="Connections shown here reflect what the server can actually use. Secrets are encrypted and never shown again." />
      <IntegrationsPanel data={data} />
    </div>
  );
}
