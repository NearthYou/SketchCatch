import { MarkerType, Position } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { DiagramEdge, DiagramNode } from "../../../../packages/types/src";

import {
  getEdgeStrokeWidth,
  normalizeEdgeKind
} from "./diagram-utils";
import { BOARD_DEFAULT_EDGE_COLOR } from "./constants";
import { getAreaNodeLabel, isAreaNode } from "./area-nodes";
import { getResourceNodeDisplayLabel } from "./resource-node-display-label";
import type {
  DiagramFlowEdge,
  DiagramFlowNode,
  DiagramFlowNodeHandlers,
  DiagramPreviewAnnotations,
  DiagramPreviewState
} from "./types";

type FlowMapperOptions = {
  readonly activeConnectionSourceNodeId?: string | null | undefined;
  readonly edges?: readonly DiagramEdge[] | undefined;
  readonly isPreview?: boolean;
  readonly previewAnnotations?: DiagramPreviewAnnotations | undefined;
};

const CONTAINMENT_EDGE_LABELS = new Set(["contains", "hosts"]);
const EDGE_LABEL_MAX_CHARACTERS = 30;
const PREVIEW_EDGE_OPACITY = 0.8;
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
  activeAreaDropTargetNodeId: string | null,
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
    const isDimmed = !isPreview && shouldDimUnselectedNodes && !selected;
    const isAreaDropTarget = !isPreview && isArea && node.id === activeAreaDropTargetNodeId;
    const isValidConnectionTarget = isValidConnectionTargetNode(
      node,
      isConnectionActive,
      options.activeConnectionSourceNodeId,
      options.edges ?? [],
      nodeById,
      isPreview
    );

    return {
      id: node.id,
      ariaLabel: getFlowNodeAriaLabel(node, {
        isDimmed,
        isPreview,
        isAreaDropTarget,
        previewState,
        selected
      }),
      ...(isArea ? { className: areaClassName } : {}),
      type: "diagramNode",
      position: { ...node.position },
      data: {
        areaDepth: isArea ? getAreaAncestorDepth(node, nodeById) : 0,
        node,
        selectedNodeCount: isPreview ? 0 : selectedNodeIds.length,
        isDimmed,
        isConnectionActive,
        isValidConnectionTarget,
        isPreview,
        previewState,
        isAreaDropTarget,
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

// 보드의 관계 데이터를 React Flow가 그릴 수 있는 연결선으로 바꿉니다.
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
    const color = edgeStyle.color ?? BOARD_DEFAULT_EDGE_COLOR;
    const fullLabel = edge.label?.trim() || undefined;
    const visibleLabel = getVisibleEdgeLabel(fullLabel);
    const previewState = previewAnnotations?.edgeStates[edge.id];
    const markerColor = getFlowEdgeMarkerColor(color, isPreview);
    const flowEdge: DiagramFlowEdge = {
      id: edge.id,
      ariaLabel: getFlowEdgeAriaLabel(edge, fullLabel, selected, isPreview, previewState),
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      ...(edge.sourceHandleId ? { sourceHandle: toReactFlowHandleId(edge.sourceHandleId, "source") } : {}),
      ...(edge.targetHandleId ? { targetHandle: toReactFlowHandleId(edge.targetHandleId, "target") } : {}),
      type: "diagramEdge",
      data: {
        edge,
        isAnimated: !isPreview && edgeStyle.animated === true,
        pathKind: normalizeEdgeKind(edge.type),
        previewState
      },
      selected,
      animated: false,
      ...(visibleLabel ? { label: visibleLabel } : {}),
      labelBgBorderRadius: 5,
      labelBgPadding: [8, 3],
      labelBgStyle: {
        fill: "#f8fbff",
        stroke: "#9fb2c8",
        strokeWidth: 1
      },
      labelStyle: {
        fill: "#172033",
        fontFamily: "var(--workspace-font)",
        fontSize: 12,
        fontWeight: 600
      },
      selectable: !isPreview,
      deletable: !isPreview,
      interactionWidth: 18,
      zIndex: getFlowEdgeZIndex(edge, nodeById, selected),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: markerColor,
        ...getEdgeMarkerGeometry(edgeStyle.width),
        markerUnits: "userSpaceOnUse"
      },
      style: getFlowEdgeStyle(edge, isPreview, nodeById)
    };

    return flowEdge;
  });
}

function isValidConnectionTargetNode(
  node: DiagramNode,
  isConnectionActive: boolean,
  sourceNodeId: string | null | undefined,
  edges: readonly DiagramEdge[],
  nodeById: ReadonlyMap<string, DiagramNode>,
  isPreview: boolean
): boolean {
  if (!isConnectionActive || isPreview || !sourceNodeId || sourceNodeId === node.id || node.locked) {
    return false;
  }

  const sourceNode = nodeById.get(sourceNodeId);

  if (!sourceNode || sourceNode.locked) {
    return false;
  }

  return !edges.some(
    (edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === node.id
  );
}

function getFlowNodeAriaLabel(
  node: DiagramNode,
  state: {
    readonly isDimmed: boolean;
    readonly isPreview: boolean;
    readonly isAreaDropTarget: boolean;
    readonly previewState: DiagramPreviewState | undefined;
    readonly selected: boolean;
  }
): string {
  const label = isAreaNode(node) ? getAreaNodeLabel(node) : getResourceNodeDisplayLabel(node);
  const states = [
    node.locked ? "잠김" : undefined,
    state.selected ? "선택됨" : undefined,
    state.isDimmed ? "흐리게 표시됨" : undefined,
    state.isPreview ? "미리보기" : undefined,
    getPreviewStateLabel(state.previewState),
    state.isAreaDropTarget ? "배치 대상" : undefined
  ].filter((value): value is string => value !== undefined);

  return [label, ...states].join(", ");
}

function getFlowEdgeAriaLabel(
  edge: DiagramEdge,
  visibleLabel: string | undefined,
  selected: boolean,
  isPreview: boolean,
  previewState: DiagramPreviewState | undefined
): string {
  const label = visibleLabel ?? `${edge.sourceNodeId} → ${edge.targetNodeId}`;
  const states = [
    selected ? "선택됨" : undefined,
    isPreview ? "미리보기" : undefined,
    getPreviewStateLabel(previewState)
  ].filter((value): value is string => value !== undefined);

  return [label, ...states].join(", ");
}

function getPreviewStateLabel(previewState: DiagramPreviewState | undefined): string | undefined {
  if (previewState === "added") {
    return "추가됨";
  }

  if (previewState === "modified") {
    return "수정됨";
  }

  if (previewState === "deleted") {
    return "삭제됨";
  }

  return undefined;
}

function getVisibleEdgeLabel(label: string | undefined): string | undefined {
  if (!label) {
    return undefined;
  }

  const characters = Array.from(label);

  if (characters.length <= EDGE_LABEL_MAX_CHARACTERS) {
    return label;
  }

  return `${characters.slice(0, EDGE_LABEL_MAX_CHARACTERS - 1).join("").trimEnd()}…`;
}

function isContainmentEdge(edge: DiagramEdge): boolean {
  const normalizedLabel = edge.label?.trim().toLowerCase();

  return normalizedLabel != null && CONTAINMENT_EDGE_LABELS.has(normalizedLabel);
}

function getFlowEdgeStyle(
  edge: DiagramEdge,
  isPreview: boolean,
  nodeById: ReadonlyMap<string, DiagramNode> = new Map()
): CSSProperties {
  const edgeStyle = getResolvedDiagramEdgeStyle(edge, nodeById);
  const color = edgeStyle.color ?? BOARD_DEFAULT_EDGE_COLOR;
  const strokeWidth = getEdgeStrokeWidth(edgeStyle.width);
  return {
    stroke: color,
    strokeDasharray: getFlowEdgeStrokeDasharray(edge, nodeById),
    strokeOpacity: isPreview ? PREVIEW_EDGE_OPACITY : undefined,
    strokeWidth
  };
}

function getFlowEdgeMarkerColor(color: string, isPreview: boolean): string {
  const opacity = isPreview ? PREVIEW_EDGE_OPACITY : undefined;

  if (opacity === undefined) {
    return color;
  }

  const hexMatch = /^#([\da-f]{6})$/iu.exec(color);

  if (!hexMatch) {
    return color;
  }

  const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, "0");

  return `#${hexMatch[1]}${alphaHex}`;
}

function getEdgeMarkerGeometry(width: NonNullable<DiagramEdge["style"]>["width"]): {
  height: number;
  width: number;
} {
  const size = width === "thick" ? 14 : width === "medium" ? 13 : 12;
  return { height: size, width: size };
}

function getFlowEdgeStrokeDasharray(
  edge: DiagramEdge,
  nodeById: ReadonlyMap<string, DiagramNode> = new Map()
): string | undefined {
  const edgeStyle = getResolvedDiagramEdgeStyle(edge, nodeById);

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

  return {
    animated: edge.style?.animated ?? inferredStyle.animated ?? false,
    color: edge.style?.color ?? inferredStyle.color ?? BOARD_DEFAULT_EDGE_COLOR,
    lineStyle: edge.style?.lineStyle ?? inferredStyle.lineStyle ?? "solid",
    width: edge.style?.width ?? inferredStyle.width ?? "thin"
  };
}

function isNonDefaultDiagramEdgeStyle(style: NonNullable<DiagramEdge["style"]>): boolean {
  return (
    style.lineStyle !== "solid" ||
    style.width !== "thin" ||
    style.color !== BOARD_DEFAULT_EDGE_COLOR
  );
}

function getDiagramEdgeStyleFromLabel(label: string | undefined): NonNullable<DiagramEdge["style"]> {
  const normalizedLabel = label?.trim().toLowerCase() ?? "";

  for (const entry of EDGE_STYLE_LABEL_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalizedLabel))) {
      return { ...entry.style };
    }
  }

  return {
    animated: false,
    color: BOARD_DEFAULT_EDGE_COLOR,
    lineStyle: "solid",
    width: "thin"
  };
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

  return {
    animated: false,
    color: BOARD_DEFAULT_EDGE_COLOR,
    lineStyle: "solid",
    width: "thin"
  };
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
