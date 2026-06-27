import type { ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";
import type {
  DiagramEdge,
  DiagramJson,
  DiagramNode,
  DiagramNodeParameters
} from "../../../../packages/types/src";

export type DiagramNodeMetadataUpdate = Partial<Omit<DiagramNode, "id" | "parameters">>;

export type DiagramEditorPanelContext = {
  diagram: DiagramJson;
  inspectedNodeId: string | null;
  isRightPanelOpen: boolean;
  resourcePanelFocusRequestId: number;
  selectedNodeId: string | null;
  nodes: readonly DiagramNode[];
  edges: readonly DiagramEdge[];
  applyDiagramJson: (diagram: DiagramJson) => void;
  closeInspectedNode: () => void;
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
  initialDiagram?: DiagramJson | undefined;
  leftPanel?: ReactNode;
  onDiagramChange?: ((diagram: DiagramJson) => void) | undefined;
  onSave?: (() => void) | undefined;
  rightPanel?: ((context: DiagramEditorPanelContext) => ReactNode) | undefined;
  saveDisabled?: boolean | undefined;
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
  onResize: (nodeId: string, size: DiagramNode["size"]) => void;
  onResizeEnd: (nodeId: string, size: DiagramNode["size"]) => void;
};

export type DiagramFlowNodeData = Record<string, unknown> & {
  node: DiagramNode;
  selectedNodeCount: number;
  isDimmed: boolean;
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
