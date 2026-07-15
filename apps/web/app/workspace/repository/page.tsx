import { WorkspaceAuthGate } from "../workspace-auth-gate";
import { RepositoryStartClient } from "./repository-start-client";

type RepositoryStartPageProps = {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// 새 프로젝트에서 만든 project 정보를 GitHub Repository 시작 화면에 전달합니다.
export default async function RepositoryStartPage({ searchParams }: RepositoryStartPageProps) {
  const params = await searchParams;

  return (
    <WorkspaceAuthGate>
      <RepositoryStartClient
        initialDefaultBranch={getSingleValue(params?.defaultBranch) ?? ""}
        initialRepositoryUrl={getSingleValue(params?.repositoryUrl) ?? ""}
        initialResumeKey={getSingleValue(params?.resumeKey) ?? ""}
        projectId={getSingleValue(params?.projectId) ?? ""}
        projectName={getSingleValue(params?.projectName) ?? "새 프로젝트"}
      />
    </WorkspaceAuthGate>
  );
}

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
