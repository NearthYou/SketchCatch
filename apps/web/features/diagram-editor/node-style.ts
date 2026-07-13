import type { DiagramNode, DiagramNodeBorderStyle } from "../../../../packages/types/src";

import { isAreaNode } from "./area-nodes";

export const AREA_NODE_DEFAULT_BORDER_COLOR = "#6f4cf6";
export const RESOURCE_NODE_BORDER_COLOR = "#d8e0ec";

const LEGACY_DEFAULT_BORDER_COLORS = new Set(["#8b98aa", "#2f6db3"]);
const DASHED_AREA_NODE_TYPES = new Set([
  "aws_region",
  "aws_availability_zone",
  "aws_security_group",
  "design_region",
  "design_az",
  "design_group",
  "sketchcatch_region",
  "sketchcatch_az",
  "sketchcatch_group"
]);

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

export function getNodeDisplayBorderStyle(node: DiagramNode): DiagramNodeBorderStyle {
  if (!isAreaNode(node)) {
    return "solid";
  }

  if (node.style?.borderStyle) {
    return node.style.borderStyle;
  }

  return DASHED_AREA_NODE_TYPES.has(getNodeTypeForBorderStyle(node)) ? "dashed" : "solid";
}

function getNodeTypeForBorderStyle(node: DiagramNode): string {
  return node.kind === "resource" ? (node.parameters?.resourceType ?? node.type) : node.type;
}
