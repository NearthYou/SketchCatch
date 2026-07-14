import { ProjectWorkspaceDraftManager, WorkspaceDraftManager } from "../../features/workspace";
import { parseBoardZoom } from "../../features/diagram-editor/board-viewport";
import { isWorkspaceCloudPlatform } from "../../features/workspace/project-draft-persistence";
import { buildBoardTemplateDiagram } from "../../features/resource-settings/template-library";
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
    readonly localCacheWorkspaceId?: string | string[] | undefined;
    readonly startMode?: string | string[] | undefined;
    readonly sourceRepositoryId?: string | string[] | undefined;
    readonly templateId?: string | string[] | undefined;
  }>;
};

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const params = await searchParams;
  const projectId = getSingleSearchParam(params?.projectId)?.trim();
  const sourceRepositoryId = getSingleSearchParam(params?.sourceRepositoryId)?.trim();
  const requestedTemplateId = getSingleSearchParam(params?.templateId)?.trim();
  const initialRightPanelView = resolveInitialWorkspaceRightPanelView(
    getSingleSearchParam(params?.startMode)
  );

  if (projectId) {
    const projectName = getSingleSearchParam(params?.projectName)?.trim();
    const cloudPlatform = getSingleSearchParam(params?.cloudPlatform);
    const localCacheWorkspaceId = getSingleSearchParam(params?.localCacheWorkspaceId)?.trim();

    return (
      <WorkspaceAuthGate>
        <ProjectWorkspaceDraftManager
          cloudPlatform={isWorkspaceCloudPlatform(cloudPlatform) ? cloudPlatform : undefined}
          initialRightPanelView={initialRightPanelView}
          localCacheWorkspaceId={localCacheWorkspaceId || undefined}
          projectId={projectId}
          projectName={projectName || "Project workspace"}
          repositoryAnalysisHandoff={
            sourceRepositoryId
              ? {
                  sourceRepositoryId,
                  ...(requestedTemplateId ? { requestedTemplateId } : {})
                }
              : undefined
          }
        />
      </WorkspaceAuthGate>
    );
  }

  const projectName = getSingleSearchParam(params?.projectName)?.trim();
  const diagramFixtureName = getSingleSearchParam(params?.diagramFixture);
  const initialDiagramOverride =
    buildBoardTemplateDiagram(getSingleSearchParam(params?.templateId), {
      projectSlug: projectName || "sketchcatch",
      shortId: "workspace"
    }) ?? getWorkspaceDiagramFixture(diagramFixtureName);
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
