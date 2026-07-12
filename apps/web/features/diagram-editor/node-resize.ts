import type { DiagramNode } from "../../../../packages/types/src";
import type { NodeResizeBounds } from "./node-resize-bounds";

export type NodeResizeHandlePosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
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
  const isLeftHandle = handlePosition === "top-left" || handlePosition === "bottom-left";
  const isTopHandle = handlePosition === "top-left" || handlePosition === "top-right";
  const rawWidth = isLeftHandle ? startSize.width - scaledDelta.x : startSize.width + scaledDelta.x;
  const rawHeight = isTopHandle ? startSize.height - scaledDelta.y : startSize.height + scaledDelta.y;
  const nextSize =
    resizeMode === "square"
      ? getSquareResizeSize(startSize, rawWidth, rawHeight, bounds)
      : {
          width: Math.round(clamp(rawWidth, bounds.minWidth, bounds.maxWidth)),
          height: Math.round(clamp(rawHeight, bounds.minHeight, bounds.maxHeight))
        };

  return {
    position: {
      x: isLeftHandle ? startRight - nextSize.width : startPosition.x,
      y: isTopHandle ? startBottom - nextSize.height : startPosition.y
    },
    size: nextSize
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
