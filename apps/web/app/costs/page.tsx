import { DashboardShell } from "../../components/dashboard/dashboard-shell";
import { CostsClient } from "./costs-client";

export default function CostsPage() {
  return (
    <DashboardShell>
      <CostsClient />
    </DashboardShell>
  );
}
