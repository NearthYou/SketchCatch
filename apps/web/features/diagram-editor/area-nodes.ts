import type { DiagramNode } from "../../../../packages/types/src";
import { getAwsRegionLabel } from "../parameter-input/aws-region-options";
import {
  getRegionNodeAwsRegion,
  isRegionAreaNode
} from "../parameter-input/region-node-metadata";
import { getResourceNodeDisplayLabel } from "./resource-node-display-label";

const designAreaNodeTypes = new Set([
  "aws-region",
  "aws_region",
  "aws_availability_zone",
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
const groupIconPath = "/Architecture-Group-Icons_07312025";

const designAreaNodeIconByType: Record<string, string> = {
  "aws-region": `${groupIconPath}/Region_32.svg`,
  design_az: `${groupIconPath}/AWS-Cloud_32.svg`,
  design_group: `${groupIconPath}/Auto-Scaling-group_32.svg`,
  design_region: `${groupIconPath}/Region_32.svg`,
  sketchcatch_az: `${groupIconPath}/AWS-Cloud_32.svg`,
  sketchcatch_group: `${groupIconPath}/Auto-Scaling-group_32.svg`,
  sketchcatch_region: `${groupIconPath}/Region_32.svg`
};

/** 화면에서 범위 프레임으로 보이는 노드와 일반 타일을 구분합니다. */
export function isAreaNode(node: DiagramNode): boolean {
  return isDesignAreaNode(node) || isResourceAreaNode(node);
}

/** 실제 parent가 될 수 없는 보안 범위를 건너뛰고 drop 대상만 찾습니다. */
export function findInnermostAreaDropTarget(
  childNode: DiagramNode,
  nodes: readonly DiagramNode[]
): DiagramNode | null {
  if (isContainmentAreaNode(childNode)) {
    return null;
  }

  return findInnermostContainmentAreaNodeAtPoint(
    nodes.filter((node) => node.id !== childNode.id),
    {
      x: childNode.position.x + childNode.size.width / 2,
      y: childNode.position.y + childNode.size.height / 2
    }
  );
}

/** 선택 hit-test를 위해 visual scope까지 포함한 가장 작은 Area를 찾습니다. */
export function findInnermostAreaNodeAtPoint(
  nodes: readonly DiagramNode[],
  point: DiagramNode["position"]
): DiagramNode | null {
  return findInnermostMatchingAreaNodeAtPoint(nodes, point, isAreaNode);
}

/** persisted parent 지정에는 VPC/Subnet 같은 실제 containment Area만 사용합니다. */
export function findInnermostContainmentAreaNodeAtPoint(
  nodes: readonly DiagramNode[],
  point: DiagramNode["position"]
): DiagramNode | null {
  return findInnermostMatchingAreaNodeAtPoint(nodes, point, isContainmentAreaNode);
}

export function getAreaNodeLabel(node: DiagramNode): string {
  const diagramAreaLabel = readDiagramTextValue(node, "diagramAreaLabel");

  if (diagramAreaLabel) {
    return isResourceAreaNode(node) ? diagramAreaLabel.toLocaleUpperCase() : diagramAreaLabel;
  }

  const diagramLabel = readDiagramTextValue(node, "diagramLabel");

  if (diagramLabel) {
    return diagramLabel;
  }

  if (isResourceAreaNode(node)) {
    return getResourceNodeDisplayLabel(node);
  }

  return node.label;
}

function readDiagramTextValue(node: DiagramNode, key: string): string | undefined {
  const value = node.parameters?.values?.[key];

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function getAreaNodeIconUrl(node: DiagramNode): string | undefined {
  if (isResourceAreaNode(node)) {
    return node.iconUrl;
  }

  return isDesignAreaNode(node) ? (node.iconUrl ?? designAreaNodeIconByType[node.type]) : undefined;
}

export function getAreaNodeMetaLabel(node: DiagramNode): string | undefined {
  if (isRegionAreaNode(node)) {
    return getAwsRegionLabel(getRegionNodeAwsRegion(node));
  }

  return undefined;
}

export function isDesignAreaNode(node: DiagramNode): boolean {
  return node.kind === "design" && designAreaNodeTypes.has(node.type);
}

export function isResourceAreaNode(node: DiagramNode): boolean {
  if (node.kind !== "resource" || getResourceNodeType(node) === "aws_autoscaling_group") {
    return false;
  }

  // Authored templates can opt a real catalog Resource into a frame without changing generic Board behavior.
  return (
    node.metadata?.presentationArea === true ||
    resourceAreaNodeTypes.has(getResourceNodeType(node))
  );
}

/** Security Group은 읽기 쉬운 범위지만 AWS 포함 관계를 만들지는 않습니다. */
export function isContainmentAreaNode(node: DiagramNode): boolean {
  return isAreaNode(node) && !isSecurityGroupScopeNode(node);
}

/** Security Group resource가 visual scope 역할을 하는지 판별합니다. */
export function isSecurityGroupScopeNode(node: DiagramNode): boolean {
  return node.kind === "resource" && getResourceNodeType(node) === "aws_security_group";
}

/** 주어진 Area 정책으로 점을 포함하는 가장 작은 프레임을 찾습니다. */
function findInnermostMatchingAreaNodeAtPoint(
  nodes: readonly DiagramNode[],
  point: DiagramNode["position"],
  matchesArea: (node: DiagramNode) => boolean
): DiagramNode | null {
  let innermostNode: DiagramNode | null = null;

  for (const node of nodes) {
    if (!matchesArea(node) || !containsPoint(node, point)) {
      continue;
    }

    if (!innermostNode || compareAreaNodes(node, innermostNode) < 0) {
      innermostNode = node;
    }
  }

  return innermostNode;
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
