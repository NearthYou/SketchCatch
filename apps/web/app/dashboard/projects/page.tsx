import { RoutePlaceholder } from "../../../components/runtime/route-placeholder";

export default function DashboardProjectsPage() {
  return (
    <RoutePlaceholder
      description="프로젝트 API와 ArchitectureJson 저장 흐름은 보존되어 있습니다."
      links={[
        { href: "/workspace/new", label: "새 프로젝트 시작" },
        { href: "/dashboard", label: "Dashboard 연결부" }
      ]}
      title="프로젝트 연결부"
    />
  );
}
