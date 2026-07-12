import { WorkspaceAuthGate } from "../workspace-auth-gate";
import { RepositoryStartClient } from "./repository-start-client";

type RepositoryStartPageProps = {
  readonly searchParams: Promise<{
    readonly projectId?: string | undefined;
    readonly projectName?: string | undefined;
  }>;
};

// 새 프로젝트에서 만든 project 정보를 GitHub Repository 시작 화면에 전달합니다.
export default async function RepositoryStartPage({ searchParams }: RepositoryStartPageProps) {
  const params = await searchParams;

  return (
    <WorkspaceAuthGate>
      <RepositoryStartClient
        projectId={params.projectId ?? ""}
        projectName={params.projectName ?? "새 프로젝트"}
      />
    </WorkspaceAuthGate>
  );
}
