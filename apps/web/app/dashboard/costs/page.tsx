import { DesignDashboardPage } from "../../../features/dashboard/design-dashboard";
import { CostsClient } from "../../costs/costs-client";

export default function CostsPage() {
  return (
    <DesignDashboardPage view="costs">
      <CostsClient />
    </DesignDashboardPage>
  );
}
