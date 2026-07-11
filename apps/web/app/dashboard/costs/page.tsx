import { CostDashboardClient } from "./cost-dashboard-client";

// 실제 AWS 사용 비용과 비용 절감 대상을 보여주는 Dashboard route입니다.
export default function DashboardCostsPage() {
  return <CostDashboardClient />;
}
