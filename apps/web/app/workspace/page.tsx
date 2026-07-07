import { ProjectWorkspaceDraftManager, WorkspaceDraftManager } from "../../features/workspace";
import { isWorkspaceCloudPlatform } from "../../features/workspace/project-draft-persistence";
import { WorkspaceAuthGate } from "./workspace-auth-gate";
import { resolveInitialWorkspaceRightPanelView } from "./workspace-start-mode";

type WorkspacePageProps = {
  readonly searchParams?: Promise<{
    readonly cloudPlatform?: string | string[] | undefined;
    readonly projectId?: string | string[] | undefined;
    readonly projectName?: string | string[] | undefined;
    readonly startMode?: string | string[] | undefined;
  }>;
};

// gg AI 기능을 팀이 직접 눌러볼 수 있게 임시 workspace 화면을 렌더링합니다.
export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const params = await searchParams;
  const projectId = getSingleSearchParam(params?.projectId)?.trim();
  const initialRightPanelView = resolveInitialWorkspaceRightPanelView(
    getSingleSearchParam(params?.startMode)
  );

  if (projectId) {
    const projectName = getSingleSearchParam(params?.projectName)?.trim();
    const cloudPlatform = getSingleSearchParam(params?.cloudPlatform);

    return (
      <WorkspaceAuthGate>
        <ProjectWorkspaceDraftManager
          cloudPlatform={isWorkspaceCloudPlatform(cloudPlatform) ? cloudPlatform : undefined}
          initialRightPanelView={initialRightPanelView}
          projectId={projectId}
          projectName={projectName || "Project workspace"}
        />
      </WorkspaceAuthGate>
    );
  }

  const projectName = getSingleSearchParam(params?.projectName)?.trim();

  return (
    <WorkspaceAuthGate>
      <WorkspaceDraftManager
        initialProjectName={projectName || undefined}
        initialRightPanelView={initialRightPanelView}
      />
    </WorkspaceAuthGate>
  );
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
