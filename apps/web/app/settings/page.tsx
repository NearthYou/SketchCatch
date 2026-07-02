import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { SettingsIntegrationsClient } from "./settings-integrations-client";

export default function SettingsPage() {
  return (
    <DashboardShell>
      <SettingsIntegrationsClient />
    </DashboardShell>
  );
}
