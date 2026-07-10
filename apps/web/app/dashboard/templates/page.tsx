import { RoutePlaceholder } from "../../../components/runtime/route-placeholder";

export default function DashboardTemplatesPage() {
  return (
    <RoutePlaceholder
      description="Template 조회와 Architecture Board 적용 계약은 보존되어 있습니다."
      links={[{ href: "/dashboard", label: "Dashboard 연결부" }]}
      title="Template 연결부"
    />
  );
}
