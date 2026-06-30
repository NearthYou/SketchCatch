import { MarkerType, Position } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";

import {
  getEdgeStrokeWidth,
  normalizeEdgeKind
} from "./diagram-utils";
import { isAreaNode } from "./area-nodes";
import type { DiagramFlowEdge, DiagramFlowNode, DiagramFlowNodeHandlers } from "./types";

export function toFlowNodes(
  nodes: readonly DiagramNode[],
  selectedNodeIds: readonly string[],
  activeReferenceDropTargetNodeId: string | null,
  handlers: DiagramFlowNodeHandlers
): DiagramFlowNode[] {
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const shouldDimUnselectedNodes = selectedNodeIds.length > 0;

  return nodes.map((node) => {
    const selected = selectedNodeIdSet.has(node.id);
    const isArea = isAreaNode(node);
    const areaClassName = selected ? "diagramAreaFlowNode diagramAreaFlowNodeInteractive" : "diagramAreaFlowNode";

    return {
      id: node.id,
      ...(isArea ? { className: areaClassName } : {}),
      type: "diagramNode",
      position: { ...node.position },
      data: {
        node,
        selectedNodeCount: selectedNodeIds.length,
        isDimmed: shouldDimUnselectedNodes && !selected,
        isReferenceDropTarget: node.id === activeReferenceDropTargetNodeId,
        ...handlers
      },
      selected,
      draggable: !node.locked,
      selectable: true,
      connectable: !node.locked,
      deletable: true,
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
  selectedEdgeIds: readonly string[]
): DiagramFlowEdge[] {
  const selectedEdgeIdSet = new Set(selectedEdgeIds);

  return edges.map((edge) => {
    const selected = selectedEdgeIdSet.has(edge.id);
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
      animated: selected || edge.style?.animated === true,
      label: edge.label,
      selectable: true,
      deletable: true,
      interactionWidth: 18,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 18,
        height: 18
      },
      style: getFlowEdgeStyle(edge, selected)
    };

    if (edge.label) {
      flowEdge.label = edge.label;
    }

    return flowEdge;
  });
}

function getFlowEdgeStyle(edge: DiagramEdge, selected: boolean): CSSProperties {
  const color = edge.style?.color ?? "#506176";
  const strokeWidth = getEdgeStrokeWidth(edge.style?.width);

  return {
    stroke: selected ? "#1f6feb" : color,
    strokeWidth
  };
}
