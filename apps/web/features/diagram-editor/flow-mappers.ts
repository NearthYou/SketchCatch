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

const CONTAINMENT_EDGE_LABELS = new Set(["contains", "hosts"]);
const EDGE_STYLE_LABEL_PATTERNS: ReadonlyArray<{
  readonly patterns: readonly RegExp[];
  readonly style: NonNullable<DiagramEdge["style"]>;
}> = [
  {
    patterns: [/\b(delete|destroy|replace|destructive)\b/u],
    style: { animated: false, color: "#b42318", lineStyle: "dashed", width: "thick" }
  },
  {
    patterns: [/\b(terraform|plan|apply|deploy|deployment|ci\/?cd|pipeline|handoff|git)\b/u],
    style: { animated: false, color: "#8a5a00", lineStyle: "dashed", width: "thick" }
  },
  {
    patterns: [
      /\b(attaches?|assumes?|encrypts?|grants?|image|launch|permission|policy|profile|role)\b/u,
      /\b(depends?(_on)?|dependency|requires?)\b/u
    ],
    style: { animated: false, color: "#6b7280", lineStyle: "solid", width: "thin" }
  },
  {
    patterns: [/\b(async|event|queue|stream|notification|pub\/?sub|publish|subscribe|sns|sqs|message|logs?|monitor(?:s|ing)?|metric|alarm)\b/u],
    style: { animated: false, color: "#476582", lineStyle: "dashed", width: "medium" }
  }
];

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
  const previewAnnotations = options.previewAnnotations;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

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
        isConnectionActive,
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
  const previewAnnotations = options.previewAnnotations;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return edges.filter((edge) => !isContainmentEdge(edge)).map((edge) => {
    const selected = !isPreview && selectedEdgeIdSet.has(edge.id);
    const edgeStyle = getResolvedDiagramEdgeStyle(edge, nodeById);
    const color = edgeStyle.color ?? "#506176";
    const visibleLabel = selected ? edge.label : undefined;
    const previewState = previewAnnotations?.edgeStates[edge.id];
    const flowEdge: DiagramFlowEdge = {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      ...(edge.sourceHandleId ? { sourceHandle: toReactFlowHandleId(edge.sourceHandleId, "source") } : {}),
      ...(edge.targetHandleId ? { targetHandle: toReactFlowHandleId(edge.targetHandleId, "target") } : {}),
      type: normalizeEdgeKind(edge.type),
      data: {
        edge,
        previewState
      },
      selected,
      animated: !isPreview && (selected || edgeStyle.animated === true),
      ...(visibleLabel ? { label: visibleLabel } : {}),
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
      style: getFlowEdgeStyle(edge, selected, isPreview, previewState, nodeById)
    };

    return flowEdge;
  });
}

function isContainmentEdge(edge: DiagramEdge): boolean {
  const normalizedLabel = edge.label?.trim().toLowerCase();

  return normalizedLabel != null && CONTAINMENT_EDGE_LABELS.has(normalizedLabel);
}

function getFlowEdgeStyle(
  edge: DiagramEdge,
  selected: boolean,
  isPreview: boolean,
  previewState: DiagramPreviewState | undefined,
  nodeById: ReadonlyMap<string, DiagramNode> = new Map()
): CSSProperties {
  const edgeStyle = getResolvedDiagramEdgeStyle(edge, nodeById);
  const color = edgeStyle.color ?? "#506176";
  const strokeWidth = getEdgeStrokeWidth(edgeStyle.width);
  const isDeletedPreview = isPreview && previewState === "deleted";

  return {
    stroke: isDeletedPreview ? "#8b949e" : selected ? "#1f6feb" : color,
    strokeDasharray: getFlowEdgeStrokeDasharray(edge, isPreview, nodeById),
    strokeOpacity: isDeletedPreview ? 0.36 : isPreview ? 0.48 : undefined,
    strokeWidth
  };
}

function getFlowEdgeStrokeDasharray(
  edge: DiagramEdge,
  isPreview: boolean,
  nodeById: ReadonlyMap<string, DiagramNode> = new Map()
): string | undefined {
  const edgeStyle = getResolvedDiagramEdgeStyle(edge, nodeById);

  if (isPreview) {
    return "7 5";
  }

  if (edgeStyle.lineStyle === "dashed") {
    return "7 5";
  }

  if (edgeStyle.lineStyle === "dotted") {
    return "2 5";
  }

  return undefined;
}

function getResolvedDiagramEdgeStyle(
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, DiagramNode> = new Map()
): NonNullable<DiagramEdge["style"]> {
  const labelStyle = getDiagramEdgeStyleFromLabel(edge.label);
  const endpointStyle = getDiagramEdgeStyleFromEndpoints(edge, nodeById);
  const inferredStyle = isNonDefaultDiagramEdgeStyle(labelStyle) ? labelStyle : endpointStyle;
  const shouldPreferInferredStyle =
    isNonDefaultDiagramEdgeStyle(inferredStyle) &&
    (edge.style?.lineStyle == null || edge.style.lineStyle === "solid");

  return {
    animated: edge.style?.animated ?? inferredStyle.animated ?? false,
    color: shouldPreferInferredStyle ? inferredStyle.color : (edge.style?.color ?? inferredStyle.color ?? "#506176"),
    lineStyle: shouldPreferInferredStyle ? inferredStyle.lineStyle : (edge.style?.lineStyle ?? inferredStyle.lineStyle ?? "solid"),
    width: shouldPreferInferredStyle ? inferredStyle.width : (edge.style?.width ?? inferredStyle.width ?? "medium")
  };
}

function isNonDefaultDiagramEdgeStyle(style: NonNullable<DiagramEdge["style"]>): boolean {
  return style.lineStyle !== "solid" || style.width !== "medium" || style.color !== "#506176";
}

function getDiagramEdgeStyleFromLabel(label: string | undefined): NonNullable<DiagramEdge["style"]> {
  const normalizedLabel = label?.trim().toLowerCase() ?? "";

  for (const entry of EDGE_STYLE_LABEL_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalizedLabel))) {
      return { ...entry.style };
    }
  }

  return { animated: false, color: "#506176", lineStyle: "solid", width: "medium" };
}

function getDiagramEdgeStyleFromEndpoints(
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, DiagramNode>
): NonNullable<DiagramEdge["style"]> {
  const sourceType = getNodeResourceType(nodeById.get(edge.sourceNodeId));
  const targetType = getNodeResourceType(nodeById.get(edge.targetNodeId));

  if (isConfigurationDependencyResourceType(sourceType) || isConfigurationDependencyResourceType(targetType)) {
    return { animated: false, color: "#6b7280", lineStyle: "solid", width: "thin" };
  }

  if (isEventResourceType(sourceType) || isEventResourceType(targetType)) {
    return { animated: false, color: "#476582", lineStyle: "dashed", width: "medium" };
  }

  return { animated: false, color: "#506176", lineStyle: "solid", width: "medium" };
}

function getNodeResourceType(node: DiagramNode | undefined): string {
  return node?.parameters?.resourceType ?? node?.type ?? "";
}

function isConfigurationDependencyResourceType(resourceType: string): boolean {
  return (
    resourceType === "aws_acm_certificate" ||
    resourceType === "aws_ami" ||
    resourceType === "aws_iam_instance_profile" ||
    resourceType === "aws_iam_policy" ||
    resourceType === "aws_iam_role" ||
    resourceType === "aws_key_pair" ||
    resourceType === "aws_kms_key" ||
    resourceType === "aws_lambda_permission" ||
    resourceType === "aws_launch_template" ||
    resourceType === "aws_security_group" ||
    resourceType === "aws_security_group_rule"
  );
}

function isEventResourceType(resourceType: string): boolean {
  return [
    "aws_cloudwatch_log_group",
    "aws_cloudwatch_metric_alarm",
    "aws_lambda_event_source_mapping",
    "aws_sns_topic",
    "aws_sqs_queue"
  ].includes(resourceType);
}

function toReactFlowHandleId(handleId: string, handleType: "source" | "target"): string {
  const side = handleId.match(/(?:source-|target-|handle-)?(left|top|right|bottom)$/u)?.[1];
  return side ? `${handleType}-handle-${side}` : handleId;
}

const CONTAINMENT_Z_STEP = 100;
const AREA_Z_BASE = 0;
const RESOURCE_Z_BASE = 100_000;
const AUTHORED_Z_INDEX_MAX = 20;

function getFlowNodeZIndex(node: DiagramNode, nodeById: ReadonlyMap<string, DiagramNode>): number {
  const depth = getAreaAncestorDepth(node, nodeById);
  const authoredZIndex = Number.isFinite(node.zIndex)
    ? Math.max(0, Math.min(AUTHORED_Z_INDEX_MAX, node.zIndex))
    : 0;
  const layerBase = isAreaNode(node) ? AREA_Z_BASE : RESOURCE_Z_BASE;

  return layerBase + depth * CONTAINMENT_Z_STEP + authoredZIndex;
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
