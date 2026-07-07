import { WorkspaceAuthGate } from "../workspace-auth-gate";
import { ReverseWorkspaceClient } from "./reverse-workspace-client";

type ReverseWorkspacePageProps = {
  readonly searchParams?: Promise<{
    readonly cloudPlatform?: string | string[] | undefined;
    readonly projectName?: string | string[] | undefined;
  }>;
};

// 새 프로젝트 Reverse 시작은 기존 workspace 오른쪽 패널이 아니라 전용 전체 화면으로 엽니다.
export default async function ReverseWorkspacePage({ searchParams }: ReverseWorkspacePageProps) {
  const params = await searchParams;
  const projectName = getSingleSearchParam(params?.projectName)?.trim() || "기존 AWS 가져오기";

  return (
    <WorkspaceAuthGate>
      <ReverseWorkspaceClient projectName={projectName} />
    </WorkspaceAuthGate>
  );
}

// Next searchParams는 문자열 하나 또는 배열로 올 수 있어서 첫 값만 사용합니다.
function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
