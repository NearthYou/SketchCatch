import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <DashboardShell>
      <SettingsClient />
    </DashboardShell>
  );
}
