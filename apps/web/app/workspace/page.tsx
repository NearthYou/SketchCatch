import { WorkspaceAuthGate } from "./workspace-auth-gate";
import { WorkspaceProjectClient } from "./workspace-project-client";

type WorkspacePageProps = {
  readonly searchParams: Promise<{
    readonly projectId?: string | undefined;
    readonly projectName?: string | undefined;
    readonly sourceRepositoryId?: string | undefined;
    readonly templateId?: string | undefined;
  }>;
};

// Workspace query를 Board 저장 흐름과 Repository 분석 handoff로 연결합니다.
export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const params = await searchParams;

  return (
    <WorkspaceAuthGate>
      <WorkspaceProjectClient
        projectId={params.projectId ?? ""}
        projectName={params.projectName ?? "Project workspace"}
        repositoryHandoff={
          params.sourceRepositoryId
            ? {
                requestedTemplateId: params.templateId,
                sourceRepositoryId: params.sourceRepositoryId
              }
            : undefined
        }
      />
    </WorkspaceAuthGate>
  );
}
