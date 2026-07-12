import type { DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "./area-nodes";
import { getResourceNodeVisualBounds } from "./resource-node-visual-footprint";

export type ObstacleSafeEdgeHandles = Readonly<{
  sourceHandleId: string;
  targetHandleId: string;
}>;

type Point = Readonly<{ x: number; y: number }>;
type RouteSegment = Readonly<{ from: Point; to: Point }>;

const HANDLE_IDS = ["handle-left", "handle-right", "handle-top", "handle-bottom"] as const;
const HANDLE_STUB_LENGTH = 16;
const OBSTACLE_OVERLAP_WEIGHT = 1_000_000;
const ENDPOINT_REENTRY_WEIGHT = 100_000;
const WRONG_DIRECTION_WEIGHT = 10_000;

export function getObstacleSafeEdgeHandles(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  nodes: readonly DiagramNode[]
): ObstacleSafeEdgeHandles {
  const obstacles = nodes.filter(
    (node) => node.id !== sourceNode.id && node.id !== targetNode.id && !isAreaNode(node)
  );
  let bestHandles: ObstacleSafeEdgeHandles = {
    sourceHandleId: "handle-right",
    targetHandleId: "handle-left"
  };
  let bestScore = Number.POSITIVE_INFINITY;

  for (const sourceHandleId of HANDLE_IDS) {
    for (const targetHandleId of HANDLE_IDS) {
      const handles = { sourceHandleId, targetHandleId };
      const segments = getOrthogonalRouteSegments(sourceNode, targetNode, handles);
      const obstacleOverlap = obstacles.reduce(
        (total, obstacle) => total + getRouteNodeOverlapLength(segments, obstacle),
        0
      );
      const endpointReentry =
        getRouteNodeOverlapLength(segments.slice(1), sourceNode) +
        getRouteNodeOverlapLength(segments.slice(0, -1), targetNode);
      const score =
        obstacleOverlap * OBSTACLE_OVERLAP_WEIGHT +
        endpointReentry * ENDPOINT_REENTRY_WEIGHT +
        getDirectionPenalty(sourceNode, targetNode, handles) * WRONG_DIRECTION_WEIGHT +
        getRouteLength(segments);

      if (score < bestScore) {
        bestHandles = handles;
        bestScore = score;
      }
    }
  }

  return bestHandles;
}

export function getOrthogonalRouteNodeOverlapLength(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  handles: ObstacleSafeEdgeHandles,
  obstacleNode: DiagramNode
): number {
  return getRouteNodeOverlapLength(
    getOrthogonalRouteSegments(sourceNode, targetNode, handles),
    obstacleNode
  );
}

export function doesOrthogonalRouteCrossResource(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  handles: ObstacleSafeEdgeHandles,
  nodes: readonly DiagramNode[]
): boolean {
  return nodes.some(
    (node) =>
      node.id !== sourceNode.id &&
      node.id !== targetNode.id &&
      !isAreaNode(node) &&
      getOrthogonalRouteNodeOverlapLength(sourceNode, targetNode, handles, node) > 0
  );
}

function getOrthogonalRouteSegments(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  handles: ObstacleSafeEdgeHandles
): RouteSegment[] {
  const sourcePoint = getNodeHandlePoint(sourceNode, handles.sourceHandleId);
  const targetPoint = getNodeHandlePoint(targetNode, handles.targetHandleId);
  const sourceExitPoint = getHandleStubPoint(sourcePoint, handles.sourceHandleId);
  const targetExitPoint = getHandleStubPoint(targetPoint, handles.targetHandleId);
  const segments: RouteSegment[] = [{ from: sourcePoint, to: sourceExitPoint }];

  if (sourceExitPoint.x === targetExitPoint.x || sourceExitPoint.y === targetExitPoint.y) {
    segments.push(
      { from: sourceExitPoint, to: targetExitPoint },
      { from: targetExitPoint, to: targetPoint }
    );
    return withoutZeroLengthSegments(segments);
  }

  if (isVerticalHandle(handles.sourceHandleId) && isVerticalHandle(handles.targetHandleId)) {
    const middleY = sourceExitPoint.y + (targetExitPoint.y - sourceExitPoint.y) / 2;
    segments.push(
      { from: sourceExitPoint, to: { x: sourceExitPoint.x, y: middleY } },
      { from: { x: sourceExitPoint.x, y: middleY }, to: { x: targetExitPoint.x, y: middleY } },
      { from: { x: targetExitPoint.x, y: middleY }, to: targetExitPoint },
      { from: targetExitPoint, to: targetPoint }
    );
    return withoutZeroLengthSegments(segments);
  }

  const middleX = sourceExitPoint.x + (targetExitPoint.x - sourceExitPoint.x) / 2;
  segments.push(
    { from: sourceExitPoint, to: { x: middleX, y: sourceExitPoint.y } },
    { from: { x: middleX, y: sourceExitPoint.y }, to: { x: middleX, y: targetExitPoint.y } },
    { from: { x: middleX, y: targetExitPoint.y }, to: targetExitPoint },
    { from: targetExitPoint, to: targetPoint }
  );
  return withoutZeroLengthSegments(segments);
}

function getNodeHandlePoint(node: DiagramNode, handleId: string): Point {
  const centerX = node.position.x + node.size.width / 2;
  const centerY = node.position.y + node.size.height / 2;

  if (handleId === "handle-left") return { x: node.position.x, y: centerY };
  if (handleId === "handle-right") return { x: node.position.x + node.size.width, y: centerY };
  if (handleId === "handle-top") return { x: centerX, y: node.position.y };
  return { x: centerX, y: node.position.y + node.size.height };
}

function getHandleStubPoint(point: Point, handleId: string): Point {
  if (handleId === "handle-left") return { x: point.x - HANDLE_STUB_LENGTH, y: point.y };
  if (handleId === "handle-right") return { x: point.x + HANDLE_STUB_LENGTH, y: point.y };
  if (handleId === "handle-top") return { x: point.x, y: point.y - HANDLE_STUB_LENGTH };
  return { x: point.x, y: point.y + HANDLE_STUB_LENGTH };
}

function getRouteNodeOverlapLength(segments: readonly RouteSegment[], node: DiagramNode): number {
  const bounds = getResourceNodeVisualBounds(node);
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;

  return segments.reduce((total, segment) => {
    if (segment.from.y === segment.to.y) {
      if (segment.from.y <= top || segment.from.y >= bottom) return total;
      return total + getRangeOverlap(segment.from.x, segment.to.x, left, right);
    }

    if (segment.from.x === segment.to.x) {
      if (segment.from.x <= left || segment.from.x >= right) return total;
      return total + getRangeOverlap(segment.from.y, segment.to.y, top, bottom);
    }

    return total;
  }, 0);
}

function getDirectionPenalty(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  handles: ObstacleSafeEdgeHandles
): number {
  const deltaX = targetNode.position.x - sourceNode.position.x;
  const deltaY = targetNode.position.y - sourceNode.position.y;
  const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);

  if (horizontal) {
    const expectedSource = deltaX >= 0 ? "handle-right" : "handle-left";
    const expectedTarget = deltaX >= 0 ? "handle-left" : "handle-right";
    return Number(handles.sourceHandleId !== expectedSource) + Number(handles.targetHandleId !== expectedTarget);
  }

  const expectedSource = deltaY >= 0 ? "handle-bottom" : "handle-top";
  const expectedTarget = deltaY >= 0 ? "handle-top" : "handle-bottom";
  return Number(handles.sourceHandleId !== expectedSource) + Number(handles.targetHandleId !== expectedTarget);
}

function getRouteLength(segments: readonly RouteSegment[]): number {
  return segments.reduce(
    (total, segment) =>
      total + Math.abs(segment.to.x - segment.from.x) + Math.abs(segment.to.y - segment.from.y),
    0
  );
}

function getRangeOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(Math.max(aStart, aEnd), bEnd) - Math.max(Math.min(aStart, aEnd), bStart));
}

function isVerticalHandle(handleId: string): boolean {
  return handleId === "handle-top" || handleId === "handle-bottom";
}

function withoutZeroLengthSegments(segments: readonly RouteSegment[]): RouteSegment[] {
  return segments.filter((segment) => segment.from.x !== segment.to.x || segment.from.y !== segment.to.y);
}
