import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { isAreaNode, isSecurityGroupScopeNode } from "../diagram-editor/area-nodes";
import { isRenderableDiagramNode } from "../diagram-editor/diagram-node-visibility";
import {
  getResourceNodeVisualBounds,
  type BoardVisualBounds
} from "../diagram-editor/resource-node-visual-footprint";

const ROOT_PARENT_ID = "__template_collision_root__";
const AREA_VISUAL_PADDING = 56;
const MAX_PLACEMENT_STEPS_PER_NODE = 1_000;

/** Template node를 40px grid에 정렬하되 명시된 scope와 network boundary는 보존합니다. */
export function resolveTemplateSiblingVisualCollisions(
  diagram: DiagramJson,
  gridSize = 40
): DiagramJson {
  if (!Number.isInteger(gridSize) || gridSize <= 0) {
    throw new Error("Template collision grid size must be a positive integer");
  }

  const nodeById = new Map(
    diagram.nodes.map((node) => [
      node.id,
      {
        ...node,
        metadata: node.metadata ? { ...node.metadata } : undefined,
        position: { ...node.position },
        size: { ...node.size }
      }
    ])
  );
  const intentionalArchitectureOverlaps = createIntentionalArchitectureOverlapKeys(diagram, nodeById);
  centerCollapsedHelpersInsideParents(nodeById);
  const childrenByParentId = createRenderableChildrenByParentId(nodeById);
  const parentIds = [...childrenByParentId.keys()].sort(
    (left, right) => getParentDepth(right, nodeById) - getParentDepth(left, nodeById)
  );

  for (const parentId of parentIds) {
    separateSiblingVisualBounds(
      parentId,
      childrenByParentId,
      nodeById,
      gridSize,
      intentionalArchitectureOverlaps
    );
    fitParentArea(parentId, childrenByParentId, nodeById, gridSize);
  }

  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => nodeById.get(node.id) ?? node)
  };
}

function centerCollapsedHelpersInsideParents(nodeById: Map<string, DiagramNode>): void {
  for (const node of [...nodeById.values()]) {
    if (isRenderableDiagramNode(node)) {
      continue;
    }

    const parentAreaNodeId = node.metadata?.parentAreaNodeId;
    const parent = parentAreaNodeId ? nodeById.get(parentAreaNodeId) : undefined;

    if (!parent || !isAreaNode(parent)) {
      continue;
    }

    const position = {
      x: parent.position.x + Math.max(0, (parent.size.width - node.size.width) / 2),
      y: parent.position.y + Math.max(0, (parent.size.height - node.size.height) / 2)
    };

    moveSubtree(nodeById, node.id, {
      x: position.x - node.position.x,
      y: position.y - node.position.y
    });
  }
}

function createRenderableChildrenByParentId(
  nodeById: ReadonlyMap<string, DiagramNode>
): ReadonlyMap<string, readonly string[]> {
  const childrenByParentId = new Map<string, string[]>();

  for (const node of nodeById.values()) {
    if (!isRenderableDiagramNode(node)) {
      continue;
    }

    const parentId = getResolvedParentId(node, nodeById);
    const children = childrenByParentId.get(parentId) ?? [];

    children.push(node.id);
    childrenByParentId.set(parentId, children);
  }

  return childrenByParentId;
}

function getResolvedParentId(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): string {
  const parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const parent = parentAreaNodeId ? nodeById.get(parentAreaNodeId) : undefined;

  return parent && isAreaNode(parent) ? parent.id : ROOT_PARENT_ID;
}

function getParentDepth(parentId: string, nodeById: ReadonlyMap<string, DiagramNode>): number {
  if (parentId === ROOT_PARENT_ID) {
    return -1;
  }

  let depth = 0;
  let current = nodeById.get(parentId);
  const visitedIds = new Set<string>();

  while (current?.metadata?.parentAreaNodeId && !visitedIds.has(current.id)) {
    visitedIds.add(current.id);
    depth += 1;
    current = nodeById.get(current.metadata.parentAreaNodeId);
  }

  return depth;
}

// 명시적 architecture overlap만 유지하고 나머지 sibling 충돌은 grid 아래로 밀어냅니다.
function separateSiblingVisualBounds(
  parentId: string,
  childrenByParentId: ReadonlyMap<string, readonly string[]>,
  nodeById: Map<string, DiagramNode>,
  gridSize: number,
  intentionalArchitectureOverlaps: ReadonlySet<string>
): void {
  const siblingIds = [...(childrenByParentId.get(parentId) ?? [])].sort((leftId, rightId) => {
    const left = requireNode(nodeById, leftId);
    const right = requireNode(nodeById, rightId);

    return (
      left.position.y - right.position.y ||
      left.position.x - right.position.x ||
      left.id.localeCompare(right.id)
    );
  });
  const placedIds: string[] = [];

  for (const siblingId of siblingIds) {
    let placementSteps = 0;

    while (placedIds.some((placedId) =>
      nodesIntersect(nodeById, siblingId, placedId, intentionalArchitectureOverlaps)
    )) {
      if (placementSteps >= MAX_PLACEMENT_STEPS_PER_NODE) {
        console.error(`Unable to place Template node without overlap: ${siblingId}`);
        break;
      }

      moveSubtree(nodeById, siblingId, { x: 0, y: gridSize });
      placementSteps += 1;
    }

    placedIds.push(siblingId);
  }
}

function fitParentArea(
  parentId: string,
  childrenByParentId: ReadonlyMap<string, readonly string[]>,
  nodeById: Map<string, DiagramNode>,
  gridSize: number
): void {
  if (parentId === ROOT_PARENT_ID) {
    return;
  }

  const parent = requireNode(nodeById, parentId);
  const childBounds = (childrenByParentId.get(parentId) ?? []).map((childId) =>
    getResourceNodeVisualBounds(requireNode(nodeById, childId))
  );

  if (childBounds.length === 0) {
    return;
  }

  const requiredRight = Math.max(...childBounds.map((bounds) => bounds.x + bounds.width));
  const requiredBottom = Math.max(...childBounds.map((bounds) => bounds.y + bounds.height));
  const requiredWidth = roundUp(
    requiredRight - parent.position.x + AREA_VISUAL_PADDING,
    gridSize
  );
  const requiredHeight = roundUp(
    requiredBottom - parent.position.y + AREA_VISUAL_PADDING,
    gridSize
  );

  nodeById.set(parentId, {
    ...parent,
    size: {
      width: Math.max(parent.size.width, requiredWidth),
      height: Math.max(parent.size.height, requiredHeight)
    }
  });
}

function moveSubtree(
  nodeById: Map<string, DiagramNode>,
  rootId: string,
  delta: DiagramNode["position"]
): void {
  for (const node of [...nodeById.values()]) {
    if (node.id !== rootId && !hasAreaAncestor(node, rootId, nodeById)) {
      continue;
    }

    nodeById.set(node.id, {
      ...node,
      position: {
        x: node.position.x + delta.x,
        y: node.position.y + delta.y
      }
    });
  }
}

function hasAreaAncestor(
  node: DiagramNode,
  ancestorId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  let parentId = node.metadata?.parentAreaNodeId;
  const visitedIds = new Set<string>();

  while (parentId && !visitedIds.has(parentId)) {
    if (parentId === ancestorId) {
      return true;
    }

    visitedIds.add(parentId);
    parentId = nodeById.get(parentId)?.metadata?.parentAreaNodeId;
  }

  return false;
}

// 두 노드가 명시적 scope 또는 boundary 쌍이면 의도한 overlap으로 취급합니다.
function nodesIntersect(
  nodeById: ReadonlyMap<string, DiagramNode>,
  leftId: string,
  rightId: string,
  intentionalArchitectureOverlaps: ReadonlySet<string>
): boolean {
  if (intentionalArchitectureOverlaps.has(createNodePairKey(leftId, rightId))) {
    return false;
  }

  return boundsIntersect(
    getResourceNodeVisualBounds(requireNode(nodeById, leftId)),
    getResourceNodeVisualBounds(requireNode(nodeById, rightId))
  );
}

// SG target과 IGW/Route Association 경계 marker처럼 의도된 architecture overlap만 수집합니다.
function createIntentionalArchitectureOverlapKeys(
  diagram: DiagramJson,
  nodeById: ReadonlyMap<string, DiagramNode>
): ReadonlySet<string> {
  const overlapKeys = new Set<string>();

  for (const edge of diagram.edges) {
    const scope = nodeById.get(edge.sourceNodeId);
    const target = nodeById.get(edge.targetNodeId);

    if (!scope || !target || !isSecurityGroupScopeNode(scope)) {
      continue;
    }

    if (containsBounds(getResourceNodeVisualBounds(scope), getResourceNodeVisualBounds(target))) {
      overlapKeys.add(createNodePairKey(scope.id, target.id));
    }
  }

  for (const marker of nodeById.values()) {
    const markerType = getResourceType(marker);
    const boundaryContract = markerType === "aws_internet_gateway"
      ? { referenceKey: "vpcId", targetType: "aws_vpc" }
      : markerType === "aws_route_table_association"
        ? { referenceKey: "subnetId", targetType: "aws_subnet" }
        : undefined;

    if (!boundaryContract) {
      continue;
    }

    const boundary = [...nodeById.values()].find(
      (candidate) =>
        getResourceType(candidate) === boundaryContract.targetType &&
        referencesResourceNode(marker, boundaryContract.referenceKey, candidate)
    );

    if (boundary && straddlesStoredBoundary(boundary, marker)) {
      overlapKeys.add(createNodePairKey(boundary.id, marker.id));
    }
  }

  return overlapKeys;
}

// materialized Terraform address가 boundary Area의 identity를 정확히 참조하는지 확인합니다.
function referencesResourceNode(source: DiagramNode, valueKey: string, target: DiagramNode): boolean {
  const targetType = target.parameters?.resourceType;
  const targetName = target.parameters?.resourceName;

  return Boolean(
    targetType &&
    targetName &&
    source.parameters?.values[valueKey] === `${targetType}.${targetName}.id`
  );
}

// icon stored rect가 Area 안팎에 걸쳐 있을 때만 boundary marker로 인정합니다.
function straddlesStoredBoundary(area: DiagramNode, marker: DiagramNode): boolean {
  const areaBounds = getStoredBounds(area);
  const markerBounds = getStoredBounds(marker);

  return boundsIntersect(areaBounds, markerBounds) && !containsBounds(areaBounds, markerBounds);
}

// Caption 확장 전 persisted node rectangle을 반환해 실제 경계 교차를 판정합니다.
function getStoredBounds(node: DiagramNode): BoardVisualBounds {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height
  };
}

// Terraform parameters가 있으면 resourceType을, 없으면 visual type을 사용합니다.
function getResourceType(node: DiagramNode): string {
  return node.parameters?.resourceType ?? node.type;
}

// 노드 순서와 무관한 pair key를 만들어 collision loop에서 상수 시간으로 조회합니다.
function createNodePairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `${leftId}\u0000${rightId}` : `${rightId}\u0000${leftId}`;
}

// target visual footprint 전체가 scope frame 내부인지 검사합니다.
function containsBounds(container: BoardVisualBounds, target: BoardVisualBounds): boolean {
  return (
    target.x >= container.x &&
    target.y >= container.y &&
    target.x + target.width <= container.x + container.width &&
    target.y + target.height <= container.y + container.height
  );
}

function boundsIntersect(left: BoardVisualBounds, right: BoardVisualBounds): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function roundUp(value: number, gridSize: number): number {
  return Math.ceil(value / gridSize) * gridSize;
}

function requireNode(nodeById: ReadonlyMap<string, DiagramNode>, id: string): DiagramNode {
  const node = nodeById.get(id);

  if (!node) {
    throw new Error(`Missing Template collision node: ${id}`);
  }

  return node;
}
