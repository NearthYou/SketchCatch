import { RoutePlaceholder } from "../../../components/runtime/route-placeholder";

export default function DashboardCostsPage() {
  return (
    <RoutePlaceholder
      description="Cost Analysis API와 프로젝트별 비용 데이터는 보존되어 있습니다."
      links={[{ href: "/dashboard", label: "Dashboard 연결부" }]}
      title="Cost Analysis 연결부"
    />
  );
}
