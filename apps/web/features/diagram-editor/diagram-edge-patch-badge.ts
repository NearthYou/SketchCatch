import type { DiagramPreviewState } from "./types";

const UNLABELLED_BADGE_OFFSET = 14;
const ADDED_BADGE_SOURCE_TO_LABEL_RATIO = 0.5;

type DiagramEdgePatchBadgePositionInput = {
  readonly hasLabel: boolean;
  readonly labelX: number;
  readonly labelY: number;
  readonly patchState: DiagramPreviewState;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
};

export function getDiagramEdgePatchBadgePosition({
  hasLabel,
  labelX,
  labelY,
  patchState,
  sourceX,
  sourceY,
  targetX,
  targetY
}: DiagramEdgePatchBadgePositionInput): { x: number; y: number } {
  if (hasLabel) {
    return { x: labelX, y: labelY - 18 };
  }

  const anchor =
    patchState === "added"
      ? {
          x: sourceX + (labelX - sourceX) * ADDED_BADGE_SOURCE_TO_LABEL_RATIO,
          y: sourceY + (labelY - sourceY) * ADDED_BADGE_SOURCE_TO_LABEL_RATIO
        }
      : { x: labelX, y: labelY };
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const length = Math.hypot(deltaX, deltaY) || 1;
  let normalX = -deltaY / length;
  let normalY = deltaX / length;

  if (Math.abs(normalY) >= Math.abs(normalX)) {
    if (normalY > 0) {
      normalX *= -1;
      normalY *= -1;
    }
  } else if (normalX < 0) {
    normalX *= -1;
    normalY *= -1;
  }

  return {
    x: anchor.x + normalX * UNLABELLED_BADGE_OFFSET,
    y: anchor.y + normalY * UNLABELLED_BADGE_OFFSET
  };
}
