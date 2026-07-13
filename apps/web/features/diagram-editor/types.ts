import type { ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import type {
  DiagramEdge,
  DiagramEdgeRoute,
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters
} from "../../../../packages/types/src";
import type { NodeResizeUpdate } from "./node-resize";

export type DiagramNodeMetadataUpdate = Partial<Omit<DiagramNode, "id" | "parameters">>;
export type DiagramPreviewState = "added" | "modified" | "deleted";
export type DiagramPreviewAnnotations = {
  readonly nodeStates: Readonly<Record<string, DiagramPreviewState>>;
  readonly edgeStates: Readonly<Record<string, DiagramPreviewState>>;
};

export type DiagramEditorPanelContext = {
  diagram: DiagramJson;
  inspectedNodeId: string | null;
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
  focusResourceNode: (nodeId: string) => void;
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
  leftPanel?: ReactNode;
  onBoardReady?: ((element: HTMLElement) => void) | undefined;
  onDiagramChange?: ((diagram: DiagramJson) => void) | undefined;
  onDiagramSaveRequest?: (() => Promise<unknown>) | undefined;
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
