import type { DiagramNode } from "../../../../packages/types/src";
import type { NodeResizeBounds } from "./node-resize-bounds";

export type NodeResizeHandlePosition =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";
export type NodeResizeMode = "free" | "square";

export type NodeResizeUpdate = Pick<DiagramNode, "position" | "size">;

type CalculateNodeResizeInput = {
  bounds: NodeResizeBounds;
  delta: DiagramNode["position"];
  handlePosition: NodeResizeHandlePosition;
  resizeMode?: NodeResizeMode;
  startPosition: DiagramNode["position"];
  startSize: DiagramNode["size"];
  zoom: number;
};

export function calculateNodeResize({
  bounds,
  delta,
  handlePosition,
  resizeMode = "free",
  startPosition,
  startSize,
  zoom
}: CalculateNodeResizeInput): NodeResizeUpdate {
  const scaledDelta = {
    x: delta.x / (zoom || 1),
    y: delta.y / (zoom || 1)
  };
  const startRight = startPosition.x + startSize.width;
  const startBottom = startPosition.y + startSize.height;
  const isLeftHandle = ["top-left", "bottom-left", "left"].includes(handlePosition);
  const isRightHandle = ["top-right", "bottom-right", "right"].includes(handlePosition);
  const isTopHandle = ["top-left", "top-right", "top"].includes(handlePosition);
  const isBottomHandle = ["bottom-left", "bottom-right", "bottom"].includes(handlePosition);
  const rawWidth = isLeftHandle
    ? startSize.width - scaledDelta.x
    : isRightHandle
      ? startSize.width + scaledDelta.x
      : startSize.width;
  const rawHeight = isTopHandle
    ? startSize.height - scaledDelta.y
    : isBottomHandle
      ? startSize.height + scaledDelta.y
      : startSize.height;
  const nextSize =
    resizeMode === "square"
      ? getSquareResizeSize(startSize, rawWidth, rawHeight, bounds)
      : {
          width: Math.round(clamp(rawWidth, bounds.minWidth, bounds.maxWidth)),
          height: Math.round(clamp(rawHeight, bounds.minHeight, bounds.maxHeight))
        };

  return {
    position: getResizePosition({
      handlePosition,
      isLeftHandle,
      isTopHandle,
      nextSize,
      resizeMode,
      startBottom,
      startPosition,
      startRight,
      startSize
    }),
    size: nextSize
  };
}

function getResizePosition({
  handlePosition,
  isLeftHandle,
  isTopHandle,
  nextSize,
  resizeMode,
  startBottom,
  startPosition,
  startRight,
  startSize
}: {
  handlePosition: NodeResizeHandlePosition;
  isLeftHandle: boolean;
  isTopHandle: boolean;
  nextSize: DiagramNode["size"];
  resizeMode: NodeResizeMode;
  startBottom: number;
  startPosition: DiagramNode["position"];
  startRight: number;
  startSize: DiagramNode["size"];
}): DiagramNode["position"] {
  if (resizeMode !== "square") {
    return {
      x: isLeftHandle ? startRight - nextSize.width : startPosition.x,
      y: isTopHandle ? startBottom - nextSize.height : startPosition.y
    };
  }

  const isVerticalSide = handlePosition === "top" || handlePosition === "bottom";
  const isHorizontalSide = handlePosition === "left" || handlePosition === "right";

  return {
    x: isLeftHandle
      ? startRight - nextSize.width
      : isVerticalSide
        ? startPosition.x + (startSize.width - nextSize.width) / 2
        : startPosition.x,
    y: isTopHandle
      ? startBottom - nextSize.height
      : isHorizontalSide
        ? startPosition.y + (startSize.height - nextSize.height) / 2
        : startPosition.y
  };
}

function getSquareResizeSize(
  startSize: DiagramNode["size"],
  rawWidth: number,
  rawHeight: number,
  bounds: NodeResizeBounds
): DiagramNode["size"] {
  const widthDelta = rawWidth - startSize.width;
  const heightDelta = rawHeight - startSize.height;
  const dominantDelta = Math.abs(widthDelta) >= Math.abs(heightDelta) ? widthDelta : heightDelta;
  const startSide = Math.max(startSize.width, startSize.height);
  const minSide = Math.max(bounds.minWidth, bounds.minHeight);
  const maxSide = Math.min(bounds.maxWidth, bounds.maxHeight);
  const side = Math.round(clamp(startSide + dominantDelta, minSide, maxSide));

  return {
    width: side,
    height: side
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
