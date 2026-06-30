import type { DiagramNode } from "../../../../packages/types/src";

import { isAreaNode } from "./area-nodes";

export const AREA_NODE_DEFAULT_BORDER_COLOR = "#bfdbfe";
export const RESOURCE_NODE_BORDER_COLOR = "#d8e0ec";

const LEGACY_DEFAULT_BORDER_COLORS = new Set(["#8b98aa", "#2f6db3"]);

export function canChangeNodeBorderColor(node: DiagramNode): boolean {
  return isAreaNode(node);
}

export function getNodeDisplayBorderColor(node: DiagramNode): string {
  if (!canChangeNodeBorderColor(node)) {
    return RESOURCE_NODE_BORDER_COLOR;
  }

  const borderColor = node.style?.borderColor;

  if (!borderColor || LEGACY_DEFAULT_BORDER_COLORS.has(borderColor)) {
    return AREA_NODE_DEFAULT_BORDER_COLOR;
  }

  return borderColor;
}
