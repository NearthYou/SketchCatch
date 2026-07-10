import { RoutePlaceholder } from "../../components/runtime/route-placeholder";

export default function DashboardPage() {
  return (
    <RoutePlaceholder
      description="프로젝트 목록과 Cost Analysis 연결부를 새 UI가 다시 연결할 자리입니다."
      links={[
        { href: "/workspace/new", label: "새 프로젝트 시작" },
        { href: "/dashboard/projects", label: "프로젝트 연결부" },
        { href: "/dashboard/settings", label: "설정 연결부" }
      ]}
      title="Dashboard 연결부"
    />
  );
}
