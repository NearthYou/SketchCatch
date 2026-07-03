import type { ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import type {
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters
} from "../../../../packages/types/src";
import type { NodeResizeUpdate } from "./node-resize";

export type DiagramNodeMetadataUpdate = Partial<Omit<DiagramNode, "id" | "parameters">>;

export type DiagramEditorPanelContext = {
  diagram: DiagramJson;
  inspectedNodeId: string | null;
  isPreviewActive: boolean;
  isRightPanelOpen: boolean;
  previewDiagram: DiagramJson | null;
  selectedNodeId: string | null;
  nodes: readonly DiagramNode[];
  edges: readonly DiagramEdge[];
  applyDiagramJson: (diagram: DiagramJson) => void;
  closeInspectedNode: () => void;
  focusResourceNode: (nodeId: string) => void;
  selectResourceNode: (nodeId: string) => void;
  setPreviewDiagram: (diagram: DiagramJson | null) => void;
  setRightPanelOpen: (isOpen: boolean) => void;
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
  draftStatusPanel?: ReactNode | undefined;
  floatingPanel?: ((context: DiagramEditorPanelContext) => ReactNode) | undefined;
  initialDiagram?: DiagramJson | undefined;
  leftPanel?: ReactNode;
  onDiagramChange?: ((diagram: DiagramJson) => void) | undefined;
  rightPanel?: ((context: DiagramEditorPanelContext) => ReactNode) | undefined;
  projectName?: string | undefined;
  myPageHref?: string | undefined;
  saveStatus?: string | undefined;
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
  node: DiagramNode;
  selectedNodeCount: number;
  isDimmed: boolean;
  isPreview: boolean;
  isReferenceDropTarget: boolean;
} & DiagramFlowNodeHandlers;

export type DiagramFlowEdgeData = Record<string, unknown> & {
  edge: DiagramEdge;
};

export type DiagramFlowNode = Node<DiagramFlowNodeData, "diagramNode">;
export type DiagramFlowEdge = Edge<DiagramFlowEdgeData, DiagramEdgeKind>;

export type DiagramHistoryState = {
  past: DiagramJson[];
  future: DiagramJson[];
};
