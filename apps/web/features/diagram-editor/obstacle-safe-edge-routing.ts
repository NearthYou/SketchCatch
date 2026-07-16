import type { DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "./area-nodes";
import { getResourceNodeVisualBounds } from "./resource-node-visual-footprint";

export type ObstacleSafeEdgeHandles = Readonly<{
  sourceHandleId: string;
  targetHandleId: string;
}>;

export type OrthogonalRoutePoint = Readonly<{ x: number; y: number }>;
export type OrthogonalRouteSegment = Readonly<{
  from: OrthogonalRoutePoint;
  to: OrthogonalRoutePoint;
}>;
type HandlePosition = "bottom" | "left" | "right" | "top";

const HANDLE_IDS = ["handle-left", "handle-right", "handle-top", "handle-bottom"] as const;
const EDGE_ROUTE_OFFSET = 16;
const AREA_TITLE_HEIGHT = 34;
const RESOURCE_OVERLAP_WEIGHT = 10_000_000;
const AREA_TITLE_OVERLAP_WEIGHT = 1_000_000;
const ENDPOINT_REENTRY_WEIGHT = 100_000;
const WRONG_DIRECTION_WEIGHT = 10_000;
const HANDLE_DIRECTIONS: Readonly<Record<HandlePosition, OrthogonalRoutePoint>> = {
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 }
};

export function getObstacleSafeEdgeHandles(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  nodes: readonly DiagramNode[]
): ObstacleSafeEdgeHandles {
  const resourceObstacles = nodes.filter(
    (node) => node.id !== sourceNode.id && node.id !== targetNode.id && !isAreaNode(node)
  );
  const areaTitleObstacles = nodes
    .filter((node) => node.id !== sourceNode.id && node.id !== targetNode.id && isAreaNode(node))
    .map(createAreaTitleRoutingObstacle);
  let bestHandles: ObstacleSafeEdgeHandles = {
    sourceHandleId: "handle-right",
    targetHandleId: "handle-left"
  };
  let bestScore = Number.POSITIVE_INFINITY;

  for (const sourceHandleId of HANDLE_IDS) {
    for (const targetHandleId of HANDLE_IDS) {
      const handles = { sourceHandleId, targetHandleId };
      const segments = getOrthogonalRouteSegments(sourceNode, targetNode, handles);
      const resourceOverlap = resourceObstacles.reduce(
        (total, obstacle) => total + getRouteNodeOverlapLength(segments, obstacle),
        0
      );
      const areaTitleOverlap = areaTitleObstacles.reduce(
        (total, obstacle) => total + getRouteNodeOverlapLength(segments, obstacle),
        0
      );
      const endpointReentry =
        getRouteNodeOverlapLength(segments.slice(1), sourceNode) +
        getRouteNodeOverlapLength(segments.slice(0, -1), targetNode);
      const score =
        resourceOverlap * RESOURCE_OVERLAP_WEIGHT +
        areaTitleOverlap * AREA_TITLE_OVERLAP_WEIGHT +
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

export function getObstacleSafeOrthogonalRouteSegments(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  handles: ObstacleSafeEdgeHandles
): OrthogonalRouteSegment[] {
  return getOrthogonalRouteSegments(sourceNode, targetNode, handles);
}

export function doesOrthogonalRouteCrossResource(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  handles: ObstacleSafeEdgeHandles,
  nodes: readonly DiagramNode[]
): boolean {
  return getRoutingObstacles(sourceNode, targetNode, nodes).some(
    (node) => getOrthogonalRouteNodeOverlapLength(sourceNode, targetNode, handles, node) > 0
  );
}

export function createAreaTitleRoutingObstacle(node: DiagramNode): DiagramNode {
  return {
    ...node,
    size: {
      width: node.size.width,
      height: Math.min(AREA_TITLE_HEIGHT, node.size.height)
    }
  };
}

function getRoutingObstacles(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  nodes: readonly DiagramNode[]
): DiagramNode[] {
  return nodes
    .filter((node) => node.id !== sourceNode.id && node.id !== targetNode.id)
    .map((node) => (isAreaNode(node) ? createAreaTitleRoutingObstacle(node) : node));
}

function getOrthogonalRouteSegments(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  handles: ObstacleSafeEdgeHandles
): OrthogonalRouteSegment[] {
  const sourcePoint = getNodeHandlePoint(sourceNode, handles.sourceHandleId);
  const targetPoint = getNodeHandlePoint(targetNode, handles.targetHandleId);
  const points = getSmoothStepRoutePoints(
    sourcePoint,
    targetPoint,
    getHandlePosition(handles.sourceHandleId),
    getHandlePosition(handles.targetHandleId)
  );

  return withoutZeroLengthSegments(
    points.slice(1).map((point, index) => ({ from: points[index]!, to: point }))
  );
}

function getNodeHandlePoint(node: DiagramNode, handleId: string): OrthogonalRoutePoint {
  const centerX = node.position.x + node.size.width / 2;
  const centerY = node.position.y + node.size.height / 2;

  if (handleId === "handle-left") return { x: node.position.x, y: centerY };
  if (handleId === "handle-right") return { x: node.position.x + node.size.width, y: centerY };
  if (handleId === "handle-top") return { x: centerX, y: node.position.y };
  return { x: centerX, y: node.position.y + node.size.height };
}

function getHandlePosition(handleId: string): HandlePosition {
  if (handleId === "handle-left") return "left";
  if (handleId === "handle-right") return "right";
  if (handleId === "handle-top") return "top";
  return "bottom";
}

// Mirrors React Flow's smoothstep waypoint selection so server planning and browser rendering agree.
function getSmoothStepRoutePoints(
  source: OrthogonalRoutePoint,
  target: OrthogonalRoutePoint,
  sourcePosition: HandlePosition,
  targetPosition: HandlePosition
): OrthogonalRoutePoint[] {
  const sourceDirection = HANDLE_DIRECTIONS[sourcePosition];
  const targetDirection = HANDLE_DIRECTIONS[targetPosition];
  const sourceGapped = offsetPoint(source, sourceDirection, EDGE_ROUTE_OFFSET);
  const targetGapped = offsetPoint(target, targetDirection, EDGE_ROUTE_OFFSET);
  const direction = getRouteDirection(sourceGapped, targetGapped, sourcePosition);
  const directionAxis = direction.x !== 0 ? "x" : "y";
  const currentDirection = direction[directionAxis];
  const sourceGapOffset = { x: 0, y: 0 };
  const targetGapOffset = { x: 0, y: 0 };
  let intermediatePoints: OrthogonalRoutePoint[];

  if (sourceDirection[directionAxis] * targetDirection[directionAxis] === -1) {
    const centerX = (sourceGapped.x + targetGapped.x) / 2;
    const centerY = (sourceGapped.y + targetGapped.y) / 2;
    const verticalSplit = [
      { x: centerX, y: sourceGapped.y },
      { x: centerX, y: targetGapped.y }
    ];
    const horizontalSplit = [
      { x: sourceGapped.x, y: centerY },
      { x: targetGapped.x, y: centerY }
    ];

    intermediatePoints =
      sourceDirection[directionAxis] === currentDirection
        ? directionAxis === "x"
          ? verticalSplit
          : horizontalSplit
        : directionAxis === "x"
          ? horizontalSplit
          : verticalSplit;
  } else {
    const sourceTarget = [{ x: sourceGapped.x, y: targetGapped.y }];
    const targetSource = [{ x: targetGapped.x, y: sourceGapped.y }];
    intermediatePoints =
      directionAxis === "x"
        ? sourceDirection.x === currentDirection
          ? targetSource
          : sourceTarget
        : sourceDirection.y === currentDirection
          ? sourceTarget
          : targetSource;

    if (sourcePosition === targetPosition) {
      const difference = Math.abs(source[directionAxis] - target[directionAxis]);
      if (difference <= EDGE_ROUTE_OFFSET) {
        const gapOffset = Math.min(EDGE_ROUTE_OFFSET - 1, EDGE_ROUTE_OFFSET - difference);
        if (sourceDirection[directionAxis] === currentDirection) {
          sourceGapOffset[directionAxis] =
            (sourceGapped[directionAxis] > source[directionAxis] ? -1 : 1) * gapOffset;
        } else {
          targetGapOffset[directionAxis] =
            (targetGapped[directionAxis] > target[directionAxis] ? -1 : 1) * gapOffset;
        }
      }
    }

    if (sourcePosition !== targetPosition) {
      const oppositeAxis = directionAxis === "x" ? "y" : "x";
      const sameDirection = sourceDirection[directionAxis] === targetDirection[oppositeAxis];
      const sourceAfterTarget = sourceGapped[oppositeAxis] > targetGapped[oppositeAxis];
      const sourceBeforeTarget = sourceGapped[oppositeAxis] < targetGapped[oppositeAxis];
      const flipSourceTarget =
        (sourceDirection[directionAxis] === 1 &&
          ((!sameDirection && sourceAfterTarget) || (sameDirection && sourceBeforeTarget))) ||
        (sourceDirection[directionAxis] !== 1 &&
          ((!sameDirection && sourceBeforeTarget) || (sameDirection && sourceAfterTarget)));

      if (flipSourceTarget) {
        intermediatePoints = directionAxis === "x" ? sourceTarget : targetSource;
      }
    }
  }

  const gappedSource = offsetPoint(sourceGapped, sourceGapOffset, 1);
  const gappedTarget = offsetPoint(targetGapped, targetGapOffset, 1);
  const firstIntermediatePoint = intermediatePoints[0]!;
  const lastIntermediatePoint = intermediatePoints[intermediatePoints.length - 1]!;

  return [
    source,
    ...(pointsEqual(gappedSource, firstIntermediatePoint) ? [] : [gappedSource]),
    ...intermediatePoints,
    ...(pointsEqual(gappedTarget, lastIntermediatePoint) ? [] : [gappedTarget]),
    target
  ];
}

function getRouteDirection(
  source: OrthogonalRoutePoint,
  target: OrthogonalRoutePoint,
  sourcePosition: HandlePosition
): OrthogonalRoutePoint {
  if (sourcePosition === "left" || sourcePosition === "right") {
    return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 };
  }

  return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

function offsetPoint(
  point: OrthogonalRoutePoint,
  direction: OrthogonalRoutePoint,
  distance: number
): OrthogonalRoutePoint {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance
  };
}

function pointsEqual(left: OrthogonalRoutePoint, right: OrthogonalRoutePoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function getRouteNodeOverlapLength(
  segments: readonly OrthogonalRouteSegment[],
  node: DiagramNode
): number {
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

function getRouteLength(segments: readonly OrthogonalRouteSegment[]): number {
  return segments.reduce(
    (total, segment) =>
      total + Math.abs(segment.to.x - segment.from.x) + Math.abs(segment.to.y - segment.from.y),
    0
  );
}

function getRangeOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(Math.max(aStart, aEnd), bEnd) - Math.max(Math.min(aStart, aEnd), bStart));
}

function withoutZeroLengthSegments(
  segments: readonly OrthogonalRouteSegment[]
): OrthogonalRouteSegment[] {
  return segments.filter((segment) => segment.from.x !== segment.to.x || segment.from.y !== segment.to.y);
}
