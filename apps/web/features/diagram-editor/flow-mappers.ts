import { MarkerType, Position } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";

import {
  getEdgeStrokeWidth,
  normalizeEdgeKind
} from "./diagram-utils";
import { isAreaNode } from "./area-nodes";
import type {
  DiagramFlowEdge,
  DiagramFlowNode,
  DiagramFlowNodeHandlers,
  DiagramPreviewAnnotations,
  DiagramPreviewState
} from "./types";

type FlowMapperOptions = {
  readonly isPreview?: boolean;
  readonly previewAnnotations?: DiagramPreviewAnnotations | undefined;
};

export function toFlowNodes(
  nodes: readonly DiagramNode[],
  selectedNodeIds: readonly string[],
  activeReferenceDropTargetNodeId: string | null,
  handlers: DiagramFlowNodeHandlers,
  options: FlowMapperOptions = {}
): DiagramFlowNode[] {
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const shouldDimUnselectedNodes = selectedNodeIds.length > 0;
  const isPreview = options.isPreview === true;
  const previewAnnotations = options.previewAnnotations;

  return nodes.map((node) => {
    const selected = !isPreview && selectedNodeIdSet.has(node.id);
    const isArea = isAreaNode(node);
    const areaClassName = selected ? "diagramAreaFlowNode diagramAreaFlowNodeInteractive" : "diagramAreaFlowNode";
    const previewState = previewAnnotations?.nodeStates[node.id];

    return {
      id: node.id,
      ...(isArea ? { className: areaClassName } : {}),
      type: "diagramNode",
      position: { ...node.position },
      data: {
        node,
        selectedNodeCount: isPreview ? 0 : selectedNodeIds.length,
        isDimmed: !isPreview && shouldDimUnselectedNodes && !selected,
        isPreview,
        previewState,
        isReferenceDropTarget: !isPreview && node.id === activeReferenceDropTargetNodeId,
        ...handlers
      },
      selected,
      draggable: !isPreview && !node.locked,
      selectable: !isPreview,
      connectable: !isPreview && !node.locked,
      deletable: !isPreview,
      width: node.size.width,
      height: node.size.height,
      initialWidth: node.size.width,
      initialHeight: node.size.height,
      measured: {
        width: node.size.width,
        height: node.size.height
      },
      style: {
        width: node.size.width,
        height: node.size.height,
        ...(isArea && !node.locked && !selected ? { pointerEvents: "none" } : {})
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      zIndex: node.zIndex
    };
  });
}

export function toFlowEdges(
  edges: readonly DiagramEdge[],
  selectedEdgeIds: readonly string[],
  options: FlowMapperOptions = {}
): DiagramFlowEdge[] {
  const selectedEdgeIdSet = new Set(selectedEdgeIds);
  const isPreview = options.isPreview === true;
  const previewAnnotations = options.previewAnnotations;

  return edges.map((edge) => {
    const selected = !isPreview && selectedEdgeIdSet.has(edge.id);
    const color = edge.style?.color ?? "#506176";
    const previewState = previewAnnotations?.edgeStates[edge.id];
    const flowEdge: DiagramFlowEdge = {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      ...(edge.sourceHandleId ? { sourceHandle: edge.sourceHandleId } : {}),
      ...(edge.targetHandleId ? { targetHandle: edge.targetHandleId } : {}),
      type: normalizeEdgeKind(edge.type),
      data: {
        edge,
        previewState
      },
      selected,
      animated: !isPreview && (selected || edge.style?.animated === true),
      label: edge.label,
      selectable: !isPreview,
      deletable: !isPreview,
      interactionWidth: 18,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 18,
        height: 18
      },
      style: getFlowEdgeStyle(edge, selected, isPreview, previewState)
    };

    if (edge.label) {
      flowEdge.label = edge.label;
    }

    return flowEdge;
  });
}

function getFlowEdgeStyle(
  edge: DiagramEdge,
  selected: boolean,
  isPreview: boolean,
  previewState: DiagramPreviewState | undefined
): CSSProperties {
  const color = edge.style?.color ?? "#506176";
  const strokeWidth = getEdgeStrokeWidth(edge.style?.width);
  const isDeletedPreview = isPreview && previewState === "deleted";

  return {
    stroke: isDeletedPreview ? "#8b949e" : selected ? "#1f6feb" : color,
    strokeDasharray: isPreview ? "7 5" : undefined,
    strokeOpacity: isDeletedPreview ? 0.36 : isPreview ? 0.48 : undefined,
    strokeWidth
  };
}
