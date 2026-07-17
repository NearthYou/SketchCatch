import { Position } from "@xyflow/react";
import type { DiagramNode, DiagramPoint } from "../../../../packages/types/src";

import { isAreaNode } from "./area-nodes";
import { resolveAuthoredEdgePath } from "./authored-edge-path";
import { getDiagramEdgePath } from "./diagram-edge-path";
import type { DiagramFlowEdge } from "./types";

export const RESOURCE_CAPTION_MAX_WIDTH = 112;
export const RESOURCE_CAPTION_GAP = 4;
export const RESOURCE_CAPTION_MAX_HEIGHT = 30;
const EDGE_VISUAL_MARGIN = 14;
const EDGE_LABEL_FONT_SIZE = 12;
const EDGE_LABEL_HORIZONTAL_PADDING = 8;
const EDGE_LABEL_VERTICAL_PADDING = 3;

export type BoardVisualBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getResourceNodeVisualBounds(node: DiagramNode): BoardVisualBounds {
  if (isAreaNode(node) || (node.kind === "design" && !node.iconUrl)) {
    return getStoredNodeBounds(node);
  }

  const width = Math.max(node.size.width, RESOURCE_CAPTION_MAX_WIDTH);

  return {
    x: node.position.x - (width - node.size.width) / 2,
    y: node.position.y,
    width,
    height: node.size.height + RESOURCE_CAPTION_GAP + RESOURCE_CAPTION_MAX_HEIGHT
  };
}

export function getDiagramVisualBounds(
  nodes: readonly DiagramNode[],
  edges: readonly DiagramFlowEdge[] = []
): BoardVisualBounds {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const bounds = [
    ...nodes.map((node) => getResourceNodeVisualBounds(node)),
    ...edges.flatMap((edge) => getEdgeVisualBounds(edge, nodeById))
  ];
  const left = Math.min(...bounds.map((nodeBounds) => nodeBounds.x));
  const top = Math.min(...bounds.map((nodeBounds) => nodeBounds.y));
  const right = Math.max(...bounds.map((nodeBounds) => nodeBounds.x + nodeBounds.width));
  const bottom = Math.max(...bounds.map((nodeBounds) => nodeBounds.y + nodeBounds.height));

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

function getEdgeVisualBounds(
  edge: DiagramFlowEdge,
  nodeById: ReadonlyMap<string, DiagramNode>
): BoardVisualBounds[] {
  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);

  if (!sourceNode || !targetNode) {
    return [];
  }

  const sourcePosition = getHandlePosition(edge.sourceHandle, "right");
  const targetPosition = getHandlePosition(edge.targetHandle, "left");
  const sourcePoint = getNodeHandlePoint(sourceNode, sourcePosition);
  const targetPoint = getNodeHandlePoint(targetNode, targetPosition);
  const authoredRoute = edge.data?.authoredRoute;
  const resolvedPath = authoredRoute
    ? resolveAuthoredEdgePath(authoredRoute, {
        ...(edge.data?.isAuthoredRouteStale === undefined
          ? {}
          : { isStale: edge.data.isAuthoredRouteStale }),
        sourceX: sourcePoint.x,
        sourceY: sourcePoint.y,
        targetX: targetPoint.x,
        targetY: targetPoint.y
      })
    : getGeneratedEdgePath(edge, sourcePoint, targetPoint, sourcePosition, targetPosition);
  const bounds = getSvgPathCoordinatePairs(resolvedPath.path).map((point) =>
    getPointBounds(point, EDGE_VISUAL_MARGIN)
  );

  if (typeof edge.label === "string" && edge.label.trim()) {
    bounds.push(
      getEdgeLabelBounds(edge.label.trim(), { x: resolvedPath.labelX, y: resolvedPath.labelY })
    );
  }

  return bounds;
}

function getGeneratedEdgePath(
  edge: DiagramFlowEdge,
  sourcePoint: DiagramPoint,
  targetPoint: DiagramPoint,
  sourcePosition: Position,
  targetPosition: Position
) {
  const [path, labelX, labelY] = getDiagramEdgePath(edge.data?.pathKind ?? "smoothstep", {
    sourcePosition,
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetPosition,
    targetX: targetPoint.x,
    targetY: targetPoint.y
  });

  return { path, labelX, labelY };
}

function getHandlePosition(
  handleId: string | null | undefined,
  fallback: "left" | "right"
): Position {
  const side = handleId?.match(/(?:source-|target-|handle-)?(left|top|right|bottom)$/u)?.[1];

  if (side === "left") return Position.Left;
  if (side === "top") return Position.Top;
  if (side === "bottom") return Position.Bottom;
  if (side === "right") return Position.Right;
  return fallback === "left" ? Position.Left : Position.Right;
}

function getNodeHandlePoint(
  node: DiagramNode,
  position: Position
): DiagramPoint {
  const centerX = node.position.x + node.size.width / 2;
  const centerY = node.position.y + node.size.height / 2;

  if (position === Position.Left) return { x: node.position.x, y: centerY };
  if (position === Position.Top) return { x: centerX, y: node.position.y };
  if (position === Position.Bottom) {
    return { x: centerX, y: node.position.y + node.size.height };
  }
  return { x: node.position.x + node.size.width, y: centerY };
}

function getSvgPathCoordinatePairs(path: string): DiagramPoint[] {
  const values = path.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/giu)?.map(Number) ?? [];
  const points: DiagramPoint[] = [];

  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index]!, y: values[index + 1]! });
  }

  return points;
}

function getEdgeLabelBounds(label: string, center: DiagramPoint): BoardVisualBounds {
  const width = Math.max(1, Array.from(label).length) * EDGE_LABEL_FONT_SIZE +
    EDGE_LABEL_HORIZONTAL_PADDING * 2;
  const height = EDGE_LABEL_FONT_SIZE + EDGE_LABEL_VERTICAL_PADDING * 2;

  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  };
}

function getPointBounds(point: DiagramPoint, margin: number): BoardVisualBounds {
  return {
    x: point.x - margin,
    y: point.y - margin,
    width: margin * 2,
    height: margin * 2
  };
}

function getStoredNodeBounds(node: DiagramNode): BoardVisualBounds {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height
  };
}
