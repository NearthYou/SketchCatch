import {
  getBezierPath,
  getSmoothStepPath,
  getStraightPath
} from "@xyflow/react";
import type { Position } from "@xyflow/react";

import type { DiagramEdgeKind } from "./types";

export type DiagramEdgePathInput = {
  sourcePosition: Position;
  sourceX: number;
  sourceY: number;
  targetPosition: Position;
  targetX: number;
  targetY: number;
};

export function getDiagramEdgePath(
  kind: DiagramEdgeKind,
  input: DiagramEdgePathInput
): [path: string, labelX: number, labelY: number] {
  let result: readonly [path: string, labelX: number, labelY: number, ...rest: number[]];

  if (kind === "straight") {
    result = getStraightPath(input);
  } else if (kind === "step") {
    result = getSmoothStepPath({ ...input, borderRadius: 0, offset: 20 });
  } else if (kind === "smoothstep") {
    result = getSmoothStepPath({ ...input, borderRadius: 12, offset: 16 });
  } else {
    result = getBezierPath(input);
  }

  const [path, labelX, labelY] = takePathAndLabelPosition(result);

  return [
    path,
    labelX,
    labelY + getDiagramEdgeLabelOffset(input.sourcePosition, input.targetPosition)
  ];
}

export function getDiagramEdgeLabelOffset(
  sourcePosition: Position,
  targetPosition: Position
): number {
  const sourceIsVertical = sourcePosition === "top" || sourcePosition === "bottom";
  const targetIsVertical = targetPosition === "top" || targetPosition === "bottom";

  if (sourceIsVertical === targetIsVertical) {
    return 0;
  }

  const verticalPosition = sourceIsVertical ? sourcePosition : targetPosition;

  return verticalPosition === "top" ? -20 : 20;
}

function takePathAndLabelPosition(
  result: readonly [path: string, labelX: number, labelY: number, ...rest: number[]]
): [path: string, labelX: number, labelY: number] {
  return [result[0], result[1], result[2]];
}
