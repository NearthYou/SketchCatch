import { RoutePlaceholder } from "../../../components/runtime/route-placeholder";
import { WorkspaceStartClient } from "./workspace-start-client";

export default function NewWorkspacePage() {
  return (
    <RoutePlaceholder
      description="프로젝트 생성 API와 AI, Reverse Engineering, 빈 Architecture Board 시작 동작은 유지합니다."
      links={[{ href: "/", label: "처음으로" }]}
      title="새 프로젝트 시작"
    >
      <WorkspaceStartClient />
    </RoutePlaceholder>
  );
}
