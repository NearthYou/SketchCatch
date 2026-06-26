import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { TemplatesClient } from "./templates-client";

export default function TemplatesPage() {
  return (
    <DashboardShell>
      <TemplatesClient />
    </DashboardShell>
  );
}
