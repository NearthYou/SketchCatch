import { MarkerType, Position } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";

import {
  getEdgeStrokeWidth,
  normalizeEdgeKind
} from "./diagram-utils";
import { isAreaNode } from "./area-nodes";
import type { DiagramFlowEdge, DiagramFlowNode, DiagramFlowNodeHandlers } from "./types";

type FlowMapperOptions = {
  readonly isPreview?: boolean;
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

  return nodes.map((node) => {
    const selected = !isPreview && selectedNodeIdSet.has(node.id);
    const isArea = isAreaNode(node);
    const areaClassName = selected ? "diagramAreaFlowNode diagramAreaFlowNodeInteractive" : "diagramAreaFlowNode";

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

  return edges.map((edge) => {
    const selected = !isPreview && selectedEdgeIdSet.has(edge.id);
    const color = edge.style?.color ?? "#506176";
    const flowEdge: DiagramFlowEdge = {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      ...(edge.sourceHandleId ? { sourceHandle: edge.sourceHandleId } : {}),
      ...(edge.targetHandleId ? { targetHandle: edge.targetHandleId } : {}),
      type: normalizeEdgeKind(edge.type),
      data: {
        edge
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
      style: getFlowEdgeStyle(edge, selected, isPreview)
    };

    if (edge.label) {
      flowEdge.label = edge.label;
    }

    return flowEdge;
  });
}

function getFlowEdgeStyle(edge: DiagramEdge, selected: boolean, isPreview: boolean): CSSProperties {
  const color = edge.style?.color ?? "#506176";
  const strokeWidth = getEdgeStrokeWidth(edge.style?.width);

  return {
    stroke: selected ? "#1f6feb" : color,
    strokeDasharray: isPreview ? "7 5" : undefined,
    strokeOpacity: isPreview ? 0.48 : undefined,
    strokeWidth
  };
}
