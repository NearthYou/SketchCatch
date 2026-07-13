import type { DiagramEdgeRoute } from "../../../../packages/types/src";

type AuthoredEdgeLiveEndpoints = {
  readonly isStale?: boolean;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
};

export type ResolvedAuthoredEdgePath = {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
};

export function resolveAuthoredEdgePath(
  route: DiagramEdgeRoute,
  liveEndpoints: AuthoredEdgeLiveEndpoints
): ResolvedAuthoredEdgePath {
  const interiorWaypoints = route.waypoints.filter(
    (waypoint) =>
      !pointsEqual(waypoint, route.sourcePoint) && !pointsEqual(waypoint, route.targetPoint)
  );
  const renderedPoints = liveEndpoints.isStale
    ? [
        { x: liveEndpoints.sourceX, y: liveEndpoints.sourceY },
        ...interiorWaypoints,
        { x: liveEndpoints.targetX, y: liveEndpoints.targetY }
      ]
    : [route.sourcePoint, ...interiorWaypoints, route.targetPoint];
  const labelPosition = route.labelPosition ?? getPolylineHalfwayPoint(renderedPoints);

  return {
    path: liveEndpoints.isStale ? getPolylinePath(renderedPoints) : route.svgPath,
    labelX: labelPosition.x,
    labelY: labelPosition.y,
    sourceX: renderedPoints[0]?.x ?? liveEndpoints.sourceX,
    sourceY: renderedPoints[0]?.y ?? liveEndpoints.sourceY,
    targetX: renderedPoints.at(-1)?.x ?? liveEndpoints.targetX,
    targetY: renderedPoints.at(-1)?.y ?? liveEndpoints.targetY
  };
}

function pointsEqual(
  first: { readonly x: number; readonly y: number },
  second: { readonly x: number; readonly y: number }
): boolean {
  return first.x === second.x && first.y === second.y;
}

function getPolylinePath(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function getPolylineHalfwayPoint(
  points: readonly { readonly x: number; readonly y: number }[]
): { x: number; y: number } {
  const firstPoint = points[0] ?? { x: 0, y: 0 };
  const segments = points.slice(1).map((point, index) => {
    const start = points[index] ?? firstPoint;
    return {
      length: Math.hypot(point.x - start.x, point.y - start.y),
      start,
      end: point
    };
  });
  const halfwayLength = segments.reduce((total, segment) => total + segment.length, 0) / 2;
  let traversedLength = 0;

  for (const segment of segments) {
    if (segment.length === 0) {
      continue;
    }

    if (traversedLength + segment.length >= halfwayLength) {
      const ratio = (halfwayLength - traversedLength) / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio
      };
    }

    traversedLength += segment.length;
  }

  return { ...firstPoint };
}
