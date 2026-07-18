import { Suspense } from "react";
import { CostDashboardClient } from "./cost-dashboard-client";

// 실제 AWS 사용 비용과 비용 절감 대상을 보여주는 Dashboard route입니다.
export default function DashboardCostsPage() {
  return (
    <Suspense fallback={<CostDashboardRouteFallback />}>
      <CostDashboardClient />
    </Suspense>
  );
}

function CostDashboardRouteFallback() {
  return (
    <div className="dashboardRouteStack">
      <header className="dashboardPageHeader dashboardPageHeaderCompact">
        <div>
          <h1>비용 관리</h1>
        </div>
      </header>
    </div>
  );
}
