import { RoutePlaceholder } from "../../../components/runtime/route-placeholder";

export default function DashboardSettingsPage() {
  return (
    <RoutePlaceholder
      description="AWS Role 연결과 Git Integration API는 보존되어 있습니다."
      links={[{ href: "/dashboard", label: "Dashboard 연결부" }]}
      title="설정 연결부"
    />
  );
}
