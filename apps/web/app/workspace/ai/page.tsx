import { RoutePlaceholder } from "../../../components/runtime/route-placeholder";

export default function WorkspaceAiPage() {
  return (
    <RoutePlaceholder
      description="Requirement Input을 AI Architecture Recommendation으로 바꾸는 연결부는 보존되어 있습니다."
      links={[{ href: "/workspace/new", label: "시작 방식 다시 선택" }]}
      title="AI Architecture Draft 연결부"
    />
  );
}
