import type { DiagramNode } from "../../../../packages/types/src";

const designAreaNodeTypes = new Set([
  "design_region",
  "design_az",
  "design_group",
  "sketchcatch_region",
  "sketchcatch_az",
  "sketchcatch_group"
]);

const resourceAreaNodeTypes = new Set(["aws_vpc", "aws_subnet"]);

export function isAreaNode(node: DiagramNode): boolean {
  return isDesignAreaNode(node) || isResourceAreaNode(node);
}

export function isDesignAreaNode(node: DiagramNode): boolean {
  return node.kind === "design" && designAreaNodeTypes.has(node.type);
}

export function isResourceAreaNode(node: DiagramNode): boolean {
  return node.kind === "resource" && resourceAreaNodeTypes.has(getResourceNodeType(node));
}

function getResourceNodeType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}
