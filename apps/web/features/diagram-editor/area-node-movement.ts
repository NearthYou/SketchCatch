import type { DiagramNode } from "../../../../packages/types/src";
import { findInnermostAreaNodeAtPoint, isAreaNode } from "./area-nodes";

const AREA_CHILD_HORIZONTAL_PADDING = 12;
const AREA_CHILD_TOP_PADDING = 28;
const AREA_CHILD_BOTTOM_PADDING = 12;

type AreaMovement = {
  delta: DiagramNode["position"];
  node: DiagramNode;
};

/** Area 안에 놓은 Resource가 경계 밖으로 튀어나가지 않도록 드롭 위치를 안쪽으로 맞춥니다. */
export function placeDroppedNodeInsideArea(
  currentNodes: readonly DiagramNode[],
  droppedNode: DiagramNode,
  dropPoint: DiagramNode["position"]
): DiagramNode {
  const parentArea = findInnermostAreaNodeAtPoint(currentNodes, dropPoint);

  if (!parentArea) {
    return droppedNode;
  }

  const minX = parentArea.position.x + AREA_CHILD_HORIZONTAL_PADDING;
  const maxX =
    parentArea.position.x +
    parentArea.size.width -
    droppedNode.size.width -
    AREA_CHILD_HORIZONTAL_PADDING;
  const minY = parentArea.position.y + AREA_CHILD_TOP_PADDING;
  const maxY =
    parentArea.position.y +
    parentArea.size.height -
    droppedNode.size.height -
    AREA_CHILD_BOTTOM_PADDING;

  if (maxX < minX || maxY < minY) {
    return droppedNode;
  }

  return {
    ...droppedNode,
    position: {
      x: Math.min(Math.max(droppedNode.position.x, minX), maxX),
      y: Math.min(Math.max(droppedNode.position.y, minY), maxY)
    }
  };
}

export function applyAreaNodeMovement(
  snapshotNodes: readonly DiagramNode[],
  currentNodes: readonly DiagramNode[],
  directlyMovedNodeIds: ReadonlySet<string>
): DiagramNode[] {
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const snapshotNodeById = new Map(snapshotNodes.map((node) => [node.id, node]));
  const movingAreas = getMovingAreas(snapshotNodes, currentNodeById, directlyMovedNodeIds);
  const movingAreaById = new Map(movingAreas.map((areaMovement) => [areaMovement.node.id, areaMovement]));

  if (movingAreas.length === 0) {
    return [...currentNodes];
  }

  return currentNodes.map((currentNode) => {
    if (directlyMovedNodeIds.has(currentNode.id)) {
      return currentNode;
    }

    const snapshotNode = snapshotNodeById.get(currentNode.id);

    if (!snapshotNode) {
      return currentNode;
    }

    const parentArea = findClosestMovingParentArea(snapshotNode, snapshotNodeById, movingAreaById);

    if (!parentArea) {
      return currentNode;
    }

    return {
      ...currentNode,
      position: {
        x: snapshotNode.position.x + parentArea.delta.x,
        y: snapshotNode.position.y + parentArea.delta.y
      }
    };
  });
}

export function applyAreaNodeParentAssignments(
  currentNodes: readonly DiagramNode[],
  directlyMovedNodeIds: ReadonlySet<string>
): DiagramNode[] {
  if (directlyMovedNodeIds.size === 0) {
    return [...currentNodes];
  }

  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const directlyMovedAreaNodeIds = new Set(
    currentNodes
      .filter((node) => directlyMovedNodeIds.has(node.id) && isAreaNode(node))
      .map((node) => node.id)
  );

  return currentNodes.map((node) => {
    if (!directlyMovedNodeIds.has(node.id)) {
      return node;
    }

    const parentArea = findInnermostContainingAreaNode(
      node,
      currentNodes,
      currentNodeById,
      getIgnoredMovedAreaParentIds(node, currentNodeById, directlyMovedAreaNodeIds)
    );

    return setParentAreaNodeId(node, parentArea?.id);
  });
}

export function clearDeletedAreaParentAssignments(
  currentNodes: readonly DiagramNode[],
  deletedNodeIds: ReadonlySet<string>
): DiagramNode[] {
  if (deletedNodeIds.size === 0) {
    return [...currentNodes];
  }

  return currentNodes.map((node) => {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;

    if (!parentAreaNodeId || !deletedNodeIds.has(parentAreaNodeId)) {
      return node;
    }

    return setParentAreaNodeId(node, undefined);
  });
}

export function clearOutOfBoundsAreaParentAssignments(
  currentNodes: readonly DiagramNode[],
  resizedAreaNodeIds: ReadonlySet<string>
): DiagramNode[] {
  if (resizedAreaNodeIds.size === 0) {
    return [...currentNodes];
  }

  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));

  return currentNodes.map((node) => {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;

    if (!parentAreaNodeId || !resizedAreaNodeIds.has(parentAreaNodeId)) {
      return node;
    }

    const parentAreaNode = currentNodeById.get(parentAreaNodeId);

    if (parentAreaNode && isAreaNode(parentAreaNode) && containsNodeForParentAssignment(parentAreaNode, node)) {
      return node;
    }

    return setParentAreaNodeId(node, undefined);
  });
}

export function getDirectlyMovedNodeIdsFromPositionMap(
  previousNodes: readonly DiagramNode[],
  positionByNodeId: ReadonlyMap<string, DiagramNode["position"]>,
  candidateNodeIds?: ReadonlySet<string> | undefined
): Set<string> {
  const movedNodeIds = new Set<string>();
  const previousPositionByNodeId = new Map(previousNodes.map((node) => [node.id, node.position]));
  const nodeIdsToCheck =
    candidateNodeIds && candidateNodeIds.size > 0 ? candidateNodeIds : new Set(positionByNodeId.keys());

  for (const nodeId of nodeIdsToCheck) {
    const position = positionByNodeId.get(nodeId);
    const previousPosition = previousPositionByNodeId.get(nodeId);

    if (position && previousPosition && isDifferentPosition(previousPosition, position)) {
      movedNodeIds.add(nodeId);
    }
  }

  return movedNodeIds;
}

function getMovingAreas(
  snapshotNodes: readonly DiagramNode[],
  currentNodeById: ReadonlyMap<string, DiagramNode>,
  directlyMovedNodeIds: ReadonlySet<string>
): AreaMovement[] {
  const movingAreas: AreaMovement[] = [];

  for (const snapshotNode of snapshotNodes) {
    if (!directlyMovedNodeIds.has(snapshotNode.id) || !isAreaNode(snapshotNode)) {
      continue;
    }

    const currentNode = currentNodeById.get(snapshotNode.id);

    if (!currentNode) {
      continue;
    }

    const delta = {
      x: currentNode.position.x - snapshotNode.position.x,
      y: currentNode.position.y - snapshotNode.position.y
    };

    if (delta.x === 0 && delta.y === 0) {
      continue;
    }

    movingAreas.push({
      node: snapshotNode,
      delta
    });
  }

  return movingAreas;
}

function findClosestMovingParentArea(
  node: DiagramNode,
  snapshotNodeById: ReadonlyMap<string, DiagramNode>,
  movingAreaById: ReadonlyMap<string, AreaMovement>
): AreaMovement | undefined {
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const visitedNodeIds = new Set<string>([node.id]);

  while (parentAreaNodeId) {
    if (visitedNodeIds.has(parentAreaNodeId)) {
      return undefined;
    }

    const movingArea = movingAreaById.get(parentAreaNodeId);

    if (movingArea) {
      return movingArea;
    }

    visitedNodeIds.add(parentAreaNodeId);
    parentAreaNodeId = snapshotNodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return undefined;
}

function findInnermostContainingAreaNode(
  node: DiagramNode,
  nodes: readonly DiagramNode[],
  nodeById: ReadonlyMap<string, DiagramNode>,
  ignoredAreaNodeIds: ReadonlySet<string> = new Set()
): DiagramNode | undefined {
  let innermostArea: DiagramNode | undefined;

  for (const areaNode of nodes) {
    if (
      areaNode.id === node.id ||
      ignoredAreaNodeIds.has(areaNode.id) ||
      !isAreaNode(areaNode) ||
      isNodeDescendantOf(areaNode, node.id, nodeById) ||
      !containsNodeForParentAssignment(areaNode, node)
    ) {
      continue;
    }

    if (!innermostArea || compareAreaNodes(areaNode, innermostArea) < 0) {
      innermostArea = areaNode;
    }
  }

  return innermostArea;
}

function getIgnoredMovedAreaParentIds(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>,
  directlyMovedAreaNodeIds: ReadonlySet<string>
): ReadonlySet<string> {
  if (!isAreaNode(node) || directlyMovedAreaNodeIds.size === 0) {
    return new Set();
  }

  const existingAncestorIds = getAncestorAreaNodeIds(node, nodeById);

  return new Set([...directlyMovedAreaNodeIds].filter((nodeId) => !existingAncestorIds.has(nodeId)));
}

function getAncestorAreaNodeIds(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): Set<string> {
  const ancestorIds = new Set<string>();
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;

  while (parentAreaNodeId) {
    if (ancestorIds.has(parentAreaNodeId)) {
      break;
    }

    ancestorIds.add(parentAreaNodeId);
    parentAreaNodeId = nodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return ancestorIds;
}

function isNodeDescendantOf(
  node: DiagramNode,
  ancestorNodeId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  let parentAreaNodeId = node.metadata?.parentAreaNodeId;
  const visitedNodeIds = new Set<string>([node.id]);

  while (parentAreaNodeId) {
    if (parentAreaNodeId === ancestorNodeId) {
      return true;
    }

    if (visitedNodeIds.has(parentAreaNodeId)) {
      return false;
    }

    visitedNodeIds.add(parentAreaNodeId);
    parentAreaNodeId = nodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return false;
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

function containsNodeForParentAssignment(parentAreaNode: DiagramNode, childNode: DiagramNode): boolean {
  if (isAreaNode(childNode)) {
    return containsNodeBox(parentAreaNode, childNode);
  }

  return containsPoint(parentAreaNode, getNodeCenter(childNode));
}

function containsNodeBox(parentAreaNode: DiagramNode, childNode: DiagramNode): boolean {
  return (
    childNode.position.x >= parentAreaNode.position.x &&
    childNode.position.x + childNode.size.width <= parentAreaNode.position.x + parentAreaNode.size.width &&
    childNode.position.y >= parentAreaNode.position.y &&
    childNode.position.y + childNode.size.height <= parentAreaNode.position.y + parentAreaNode.size.height
  );
}

function getNodeCenter(node: DiagramNode): DiagramNode["position"] {
  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };
}

function getNodeArea(node: DiagramNode) {
  return Math.max(0, node.size.width) * Math.max(0, node.size.height);
}

function getNodeZIndex(node: DiagramNode) {
  return Number.isFinite(node.zIndex) ? node.zIndex : 0;
}

function isDifferentPosition(
  firstPosition: DiagramNode["position"],
  secondPosition: DiagramNode["position"]
): boolean {
  return firstPosition.x !== secondPosition.x || firstPosition.y !== secondPosition.y;
}

function setParentAreaNodeId(node: DiagramNode, parentAreaNodeId: string | undefined): DiagramNode {
  if (node.metadata?.parentAreaNodeId === parentAreaNodeId) {
    return node;
  }

  if (parentAreaNodeId) {
    return {
      ...node,
      metadata: {
        ...node.metadata,
        parentAreaNodeId
      }
    };
  }

  const { parentAreaNodeId: _parentAreaNodeId, ...nextMetadata } = node.metadata ?? {};

  return {
    ...node,
    ...(Object.keys(nextMetadata).length > 0 ? { metadata: nextMetadata } : { metadata: undefined })
  };
}
