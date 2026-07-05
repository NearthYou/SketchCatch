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
  isConnectionActive: boolean,
  handlers: DiagramFlowNodeHandlers,
  options: FlowMapperOptions = {}
): DiagramFlowNode[] {
  const selectedNodeIdSet = new Set(selectedNodeIds);
  const shouldDimUnselectedNodes = selectedNodeIds.length > 0;
  const isPreview = options.isPreview === true;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

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
        isConnectionActive,
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
      zIndex: getFlowNodeZIndex(node, nodeById)
    };
  });
}

export function toFlowEdges(
  edges: readonly DiagramEdge[],
  selectedEdgeIds: readonly string[],
  nodes: readonly DiagramNode[] = [],
  options: FlowMapperOptions = {}
): DiagramFlowEdge[] {
  const selectedEdgeIdSet = new Set(selectedEdgeIds);
  const isPreview = options.isPreview === true;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return edges.map((edge) => {
    const selected = !isPreview && selectedEdgeIdSet.has(edge.id);
    const color = edge.style?.color ?? "#506176";
    const flowEdge: DiagramFlowEdge = {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      ...(edge.sourceHandleId ? { sourceHandle: toReactFlowHandleId(edge.sourceHandleId, "source") } : {}),
      ...(edge.targetHandleId ? { targetHandle: toReactFlowHandleId(edge.targetHandleId, "target") } : {}),
      type: normalizeEdgeKind(edge.type),
      data: {
        edge
      },
      selected,
      animated: !isPreview && (selected || edge.style?.animated === true),
      label: edge.label,
      labelBgBorderRadius: 2,
      labelBgPadding: [7, 4],
      labelBgStyle: {
        fill: selected ? "#eaf4ff" : "#f8fbff",
        stroke: selected ? "#1f6feb" : "#9fb2c8",
        strokeWidth: 1
      },
      labelStyle: {
        fill: "#172033",
        fontFamily: "var(--bp-head)",
        fontSize: 12,
        fontWeight: 800
      },
      selectable: !isPreview,
      deletable: !isPreview,
      interactionWidth: 18,
      zIndex: getFlowEdgeZIndex(edge, nodeById, selected),
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

function toReactFlowHandleId(handleId: string, handleType: "source" | "target"): string {
  const side = handleId.match(/(?:source-|target-|handle-)?(left|top|right|bottom)$/u)?.[1];
  return side ? `${handleType}-handle-${side}` : handleId;
}

const CONTAINMENT_Z_STEP = 100;
const AREA_Z_OFFSET = 80;
const RESOURCE_Z_OFFSET = 40;
const AUTHORED_Z_INDEX_MAX = 20;

function getFlowNodeZIndex(node: DiagramNode, nodeById: ReadonlyMap<string, DiagramNode>): number {
  const depth = getAreaAncestorDepth(node, nodeById);
  const authoredZIndex = Number.isFinite(node.zIndex)
    ? Math.max(0, Math.min(AUTHORED_Z_INDEX_MAX, node.zIndex))
    : 0;

  return depth * CONTAINMENT_Z_STEP + (isAreaNode(node) ? AREA_Z_OFFSET : RESOURCE_Z_OFFSET) + authoredZIndex;
}

function getFlowEdgeZIndex(
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, DiagramNode>,
  selected: boolean
): number {
  const sourceNode = nodeById.get(edge.sourceNodeId);
  const targetNode = nodeById.get(edge.targetNodeId);

  if (!sourceNode || !targetNode) {
    return selected ? 90 : 60;
  }

  const endpointZIndex = Math.max(
    getFlowNodeZIndex(sourceNode, nodeById),
    getFlowNodeZIndex(targetNode, nodeById)
  );
  const hasAreaEndpoint = isAreaNode(sourceNode) || isAreaNode(targetNode);

  if (selected) {
    return endpointZIndex + 16;
  }

  return endpointZIndex + (hasAreaEndpoint ? 8 : -8);
}

function getAreaAncestorDepth(node: DiagramNode, nodeById: ReadonlyMap<string, DiagramNode>): number {
  let depth = 0;
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const visitedNodeIds = new Set<string>([node.id]);

  while (parentAreaNodeId) {
    if (visitedNodeIds.has(parentAreaNodeId)) {
      break;
    }

    const parentNode = nodeById.get(parentAreaNodeId);

    if (!parentNode || !isAreaNode(parentNode)) {
      break;
    }

    depth += 1;
    visitedNodeIds.add(parentAreaNodeId);
    parentAreaNodeId = parentNode.metadata?.parentAreaNodeId;
  }

  return depth;
}
