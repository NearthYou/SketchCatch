import type { ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import type {
  DiagramEdge,
  DiagramEdgeRoute,
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters,
  TerraformSyncFileInput
} from "../../../../packages/types/src";
import type { NodeResizeUpdate } from "./node-resize";

export type DiagramNodeMetadataUpdate = Partial<Omit<DiagramNode, "id" | "parameters">>;
export type DiagramPreviewState = "added" | "modified" | "deleted";
export type DiagramEditorMode = "editor" | "viewer";

export type DiagramEditorViewerPolicy = {
  readonly canPanAndZoom: true;
  readonly canSelectNodes: boolean;
  readonly isPreview: boolean;
  readonly isViewer: boolean;
  readonly panOnScroll: boolean;
  readonly showBoardGrid: boolean;
  readonly showEditingControls: boolean;
  readonly showPanels: boolean;
  readonly showViewportControls: true;
  readonly showWorkspaceChrome: boolean;
  readonly usesContainerHeight: boolean;
};

/** Viewer는 preview interaction을 재사용하되 embed 문맥에 맞게 scroll pan을 제한합니다. */
export function getDiagramEditorViewerPolicy(
  mode: DiagramEditorMode = "editor",
  options: { readonly panOnScroll?: boolean | undefined } = {}
): DiagramEditorViewerPolicy {
  const isViewer = mode === "viewer";

  return {
    canPanAndZoom: true,
    canSelectNodes: !isViewer,
    isPreview: isViewer,
    isViewer,
    panOnScroll: options.panOnScroll ?? true,
    showBoardGrid: !isViewer,
    showEditingControls: !isViewer,
    showPanels: !isViewer,
    showViewportControls: true,
    showWorkspaceChrome: !isViewer,
    usesContainerHeight: isViewer
  };
}

/** Preview/viewer nodes expose no resize or connection controls to pointer, keyboard, or assistive tech. */
export function shouldRenderDiagramNodeInteractionHandles(isPreview: boolean): boolean {
  return !isPreview;
}

/** Preview/viewer nodes keep invisible, inert anchors so persisted edge routes remain renderable. */
export function shouldRenderDiagramNodeEdgeAnchors(isPreview: boolean): boolean {
  return isPreview;
}

/** Viewer는 저장 후보와 같은 입력 Diagram을 normalization 없이 그대로 표시합니다. */
export function resolveDiagramEditorVisibleDiagram({
  currentDiagram,
  initialDiagram,
  initialPreviewDiagram,
  mode,
  previewDiagram
}: {
  readonly currentDiagram: DiagramJson;
  readonly initialDiagram?: DiagramJson | undefined;
  readonly initialPreviewDiagram?: DiagramJson | undefined;
  readonly mode: DiagramEditorMode;
  readonly previewDiagram: DiagramJson | null;
}): DiagramJson {
  if (mode === "viewer") {
    return initialPreviewDiagram ?? initialDiagram ?? currentDiagram;
  }

  return previewDiagram ?? currentDiagram;
}

export type DiagramPreviewAnnotations = {
  readonly nodeStates: Readonly<Record<string, DiagramPreviewState>>;
  readonly edgeStates: Readonly<Record<string, DiagramPreviewState>>;
};

export type DiagramEditorPanelContext = {
  diagram: DiagramJson;
  inspectedNodeId: string | null;
  isMutationLocked: boolean;
  isPreviewActive: boolean;
  isRightPanelOpen: boolean;
  previewAnnotations: DiagramPreviewAnnotations | null;
  previewDiagram: DiagramJson | null;
  selectedNodeId: string | null;
  terraformRefreshRequestId: number;
  nodes: readonly DiagramNode[];
  edges: readonly DiagramEdge[];
  applyDiagramJson: (diagram: DiagramJson) => void;
  closeInspectedNode: () => void;
  commitTerraformSourceAuthority: () => DiagramJson;
  focusResourceNode: (nodeId: string) => void;
  getDiagramRevision: () => number;
  requestTerraformRefresh: () => void;
  selectResourceNode: (nodeId: string) => void;
  setPreviewDiagram: (
    diagram: DiagramJson | null,
    annotations?: DiagramPreviewAnnotations | null
  ) => void;
  setRightPanelOpen: (isOpen: boolean) => void;
  saveDiagramNow?: (() => Promise<unknown>) | undefined;
  updateNodeParameters: (
    nodeId: string,
    update:
      | DiagramNodeParameters
      | undefined
      | ((parameters: DiagramNodeParameters | undefined) => DiagramNodeParameters | undefined)
  ) => void;
  updateNodeMetadata: (
    nodeId: string,
    update: DiagramNodeMetadataUpdate | ((node: DiagramNode) => DiagramNodeMetadataUpdate)
  ) => void;
};

export type DiagramEditorProps = {
  allowPreviewInspection?: boolean | undefined;
  draftStatusPanel?: ReactNode | undefined;
  emptyBoardDescription?: string | undefined;
  floatingPanel?: ((context: DiagramEditorPanelContext) => ReactNode) | undefined;
  initialBoardZoom?: number | undefined;
  initialDiagram?: DiagramJson | undefined;
  initialPreviewAnnotations?: DiagramPreviewAnnotations | undefined;
  initialPreviewDiagram?: DiagramJson | undefined;
  initialReferenceDropTargetNodeId?: string | undefined;
  initialSelectedEdgeIds?: readonly string[] | undefined;
  initialSelectedNodeIds?: readonly string[] | undefined;
  isDeploymentConsoleOpen?: boolean | undefined;
  leftPanel?: ReactNode;
  mode?: DiagramEditorMode | undefined;
  onBoardReady?: ((element: HTMLElement) => void) | undefined;
  onDiagramChange?: ((diagram: DiagramJson) => void) | undefined;
  onDiagramSaveRequest?: (() => Promise<unknown>) | undefined;
  onWorkspacePanelOpen?: (() => void) | undefined;
  panOnScroll?: boolean | undefined;
  onTemplateWorkspaceApply?:
    | ((seed: {
        readonly diagramJson: DiagramJson;
        readonly terraformFiles: readonly TerraformSyncFileInput[];
      }) => void)
    | undefined;
  onSaveAndDeployRequest?: (() => void) | undefined;
  rightPanel?: ((context: DiagramEditorPanelContext) => ReactNode) | null | undefined;
  dashboardHref?: string | undefined;
  projectName?: string | undefined;
  saveStatus?: string | undefined;
  showSaveAction?: boolean | undefined;
  workspaceUserName?: string | undefined;
};

export type DiagramEdgeKind = "default" | "smoothstep" | "step" | "straight";

export type DiagramFlowNodeHandlers = {
  onBringForward: (nodeId: string) => void;
  onSendBackward: (nodeId: string) => void;
  onTextColorChange: (nodeId: string, color: string) => void;
  onBorderColorChange: (nodeId: string, color: string) => void;
  onToggleLock: (nodeId: string) => void;
  onResizeStart: () => void;
  onResize: (nodeId: string, update: NodeResizeUpdate) => void;
  onResizeEnd: (nodeId: string, update: NodeResizeUpdate) => void;
};

export type DiagramFlowNodeData = Record<string, unknown> & {
  areaDepth: number;
  node: DiagramNode;
  selectedNodeCount: number;
  isDimmed: boolean;
  isConnectionActive: boolean;
  isValidConnectionTarget: boolean;
  isPreview: boolean;
  previewState?: DiagramPreviewState | undefined;
  isAreaDropTarget: boolean;
} & DiagramFlowNodeHandlers;

export type DiagramFlowEdgeData = Record<string, unknown> & {
  authoredRoute?: DiagramEdgeRoute | undefined;
  edge: DiagramEdge;
  isAnimated: boolean;
  isAuthoredRouteStale: boolean;
  pathKind: DiagramEdgeKind;
  previewState?: DiagramPreviewState | undefined;
};

export type DiagramFlowNode = Node<DiagramFlowNodeData, "diagramNode">;
export type DiagramFlowEdge = Edge<DiagramFlowEdgeData, "diagramEdge">;

export type DiagramHistoryState = {
  past: DiagramJson[];
  future: DiagramJson[];
};
