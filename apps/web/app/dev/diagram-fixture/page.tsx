import { notFound } from "next/navigation";
import { parseBoardZoom } from "../../../features/diagram-editor/board-viewport";
import { WorkspaceDraftManager } from "../../../features/workspace";
import {
  getWorkspaceDiagramFixture,
  getWorkspaceDiagramFixtureViewState
} from "../../../features/workspace/workspace-diagram-fixtures";

type DiagramFixturePageProps = {
  readonly searchParams?: Promise<{
    readonly boardZoom?: string | string[] | undefined;
    readonly name?: string | string[] | undefined;
  }>;
};

export default async function DiagramFixturePage({ searchParams }: DiagramFixturePageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const params = await searchParams;
  const fixtureName = getSingleSearchParam(params?.name);
  const diagram = getWorkspaceDiagramFixture(fixtureName);

  if (!diagram) {
    notFound();
  }

  const viewState = getWorkspaceDiagramFixtureViewState(fixtureName);

  return (
    <WorkspaceDraftManager
      initialBoardZoom={parseBoardZoom(getSingleSearchParam(params?.boardZoom))}
      initialDiagramOverride={diagram}
      initialPreviewAnnotations={viewState?.previewAnnotations}
      initialPreviewDiagram={viewState?.previewDiagram}
      initialProjectName={`Diagram fixture: ${fixtureName}`}
      initialReferenceDropTargetNodeId={viewState?.referenceDropTargetNodeId}
      initialSelectedEdgeIds={viewState?.selectedEdgeIds}
      initialSelectedNodeIds={viewState?.selectedNodeIds}
    />
  );
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
