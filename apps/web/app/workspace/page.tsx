import { ProjectWorkspaceDraftManager, WorkspaceDraftManager } from "../../features/workspace";
import { parseBoardZoom } from "../../features/diagram-editor/board-viewport";
import { isWorkspaceCloudPlatform } from "../../features/workspace/project-draft-persistence";
import {
  getWorkspaceDiagramFixture,
  getWorkspaceDiagramFixtureViewState
} from "../../features/workspace/workspace-diagram-fixtures";
import { WorkspaceAuthGate } from "./workspace-auth-gate";
import { resolveInitialWorkspaceRightPanelView } from "./workspace-start-mode";

type WorkspacePageProps = {
  readonly searchParams?: Promise<{
    readonly boardZoom?: string | string[] | undefined;
    readonly cloudPlatform?: string | string[] | undefined;
    readonly diagramFixture?: string | string[] | undefined;
    readonly projectId?: string | string[] | undefined;
    readonly projectName?: string | string[] | undefined;
    readonly startMode?: string | string[] | undefined;
  }>;
};

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
  const diagramFixtureName = getSingleSearchParam(params?.diagramFixture);
  const initialDiagramOverride = getWorkspaceDiagramFixture(diagramFixtureName);
  const initialFixtureViewState = getWorkspaceDiagramFixtureViewState(diagramFixtureName);
  const initialBoardZoom = initialDiagramOverride
    ? parseBoardZoom(getSingleSearchParam(params?.boardZoom))
    : undefined;

  return (
    <WorkspaceAuthGate>
      <WorkspaceDraftManager
        initialBoardZoom={initialBoardZoom}
        initialDiagramOverride={initialDiagramOverride}
        initialPreviewAnnotations={initialFixtureViewState?.previewAnnotations}
        initialPreviewDiagram={initialFixtureViewState?.previewDiagram}
        initialProjectName={projectName || undefined}
        initialReferenceDropTargetNodeId={initialFixtureViewState?.referenceDropTargetNodeId}
        initialRightPanelView={initialRightPanelView}
        initialSelectedEdgeIds={initialFixtureViewState?.selectedEdgeIds}
        initialSelectedNodeIds={initialFixtureViewState?.selectedNodeIds}
      />
    </WorkspaceAuthGate>
  );
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
