import type { DiagramNode } from "../../../../packages/types/src";

const designAreaNodeTypes = new Set([
  "design_region",
  "design_az",
  "design_group",
  "sketchcatch_region",
  "sketchcatch_az",
  "sketchcatch_group"
]);

// Region/AZ도 실제 배치에서는 Resource를 담는 큰 박스라서 VPC/Subnet과 같은 area로 다룹니다.
const resourceAreaNodeTypes = new Set([
  "aws_region",
  "aws_availability_zone",
  "aws_vpc",
  "aws_subnet",
  "aws_security_group"
]);

export function isAreaNode(node: DiagramNode): boolean {
  return isDesignAreaNode(node) || isResourceAreaNode(node);
}

export function findInnermostAreaNodeAtPoint(
  nodes: readonly DiagramNode[],
  point: DiagramNode["position"]
): DiagramNode | null {
  let innermostNode: DiagramNode | null = null;

  for (const node of nodes) {
    if (!isAreaNode(node) || !containsPoint(node, point)) {
      continue;
    }

    if (!innermostNode || compareAreaNodes(node, innermostNode) < 0) {
      innermostNode = node;
    }
  }

  return innermostNode;
}

export function getAreaNodeLabel(node: DiagramNode): string {
  if (isResourceAreaNode(node)) {
    const resourceName = node.parameters?.resourceName?.trim();

    if (resourceName) {
      return resourceName;
    }
  }

  return node.label;
}

export function getAreaNodeIconUrl(node: DiagramNode): string | undefined {
  return isResourceAreaNode(node) ? node.iconUrl : undefined;
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

function compareAreaNodes(left: DiagramNode, right: DiagramNode) {
  const areaDifference = getNodeArea(left) - getNodeArea(right);

  if (areaDifference !== 0) {
    return areaDifference;
  }

  return getNodeZIndex(right) - getNodeZIndex(left);
}

function containsPoint(node: DiagramNode, point: DiagramNode["position"]) {
  return (
    point.x >= node.position.x &&
    point.x <= node.position.x + node.size.width &&
    point.y >= node.position.y &&
    point.y <= node.position.y + node.size.height
  );
}

function getNodeArea(node: DiagramNode) {
  return Math.max(0, node.size.width) * Math.max(0, node.size.height);
}

function getNodeZIndex(node: DiagramNode) {
  return Number.isFinite(node.zIndex) ? node.zIndex : 0;
}
