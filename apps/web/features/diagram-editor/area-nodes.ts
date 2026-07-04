import type { DiagramNode } from "../../../../packages/types/src";
import { getAwsRegionLabel } from "../parameter-input/aws-region-options";
import {
  getRegionNodeAwsRegion,
  isRegionDesignNode
} from "../parameter-input/region-node-metadata";

const designAreaNodeTypes = new Set([
  "design_region",
  "design_az",
  "design_group",
  "sketchcatch_region",
  "sketchcatch_az",
  "sketchcatch_group"
]);

const resourceAreaNodeTypes = new Set(["aws_vpc", "aws_subnet", "aws_security_group"]);
const groupIconPath = "/Architecture-Group-Icons_07312025";

const designAreaNodeIconByType: Record<string, string> = {
  design_az: `${groupIconPath}/AWS-Cloud_32.svg`,
  design_group: `${groupIconPath}/Auto-Scaling-group_32.svg`,
  design_region: `${groupIconPath}/Region_32.svg`,
  sketchcatch_az: `${groupIconPath}/AWS-Cloud_32.svg`,
  sketchcatch_group: `${groupIconPath}/Auto-Scaling-group_32.svg`,
  sketchcatch_region: `${groupIconPath}/Region_32.svg`
};

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
  if (isResourceAreaNode(node)) {
    return node.iconUrl;
  }

  return isDesignAreaNode(node) ? (node.iconUrl ?? designAreaNodeIconByType[node.type]) : undefined;
}

export function getAreaNodeMetaLabel(node: DiagramNode): string | undefined {
  if (!isRegionDesignNode(node)) {
    return undefined;
  }

  return getAwsRegionLabel(getRegionNodeAwsRegion(node));
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
