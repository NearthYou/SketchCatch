import type { DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "./area-nodes";

type AreaMovement = {
  area: number;
  delta: DiagramNode["position"];
  node: DiagramNode;
};

export function applyAreaNodeMovement(
  snapshotNodes: readonly DiagramNode[],
  currentNodes: readonly DiagramNode[],
  directlyMovedNodeIds: ReadonlySet<string>
): DiagramNode[] {
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const snapshotNodeById = new Map(snapshotNodes.map((node) => [node.id, node]));
  const movingAreas = getMovingAreas(snapshotNodes, currentNodeById, directlyMovedNodeIds);

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

    const parentArea = findInnermostMovingArea(snapshotNode, movingAreas);

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
      delta,
      area: getNodeArea(snapshotNode)
    });
  }

  return movingAreas;
}

function findInnermostMovingArea(
  node: DiagramNode,
  movingAreas: readonly AreaMovement[]
): AreaMovement | undefined {
  const nodeCenter = getNodeCenter(node);
  let innermostArea: AreaMovement | undefined;

  for (const areaMovement of movingAreas) {
    if (areaMovement.node.id === node.id || !containsPoint(areaMovement.node, nodeCenter)) {
      continue;
    }

    if (!innermostArea || compareAreaMovements(areaMovement, innermostArea) < 0) {
      innermostArea = areaMovement;
    }
  }

  return innermostArea;
}

function compareAreaMovements(left: AreaMovement, right: AreaMovement) {
  const areaDifference = left.area - right.area;

  if (areaDifference !== 0) {
    return areaDifference;
  }

  return getNodeZIndex(right.node) - getNodeZIndex(left.node);
}

function containsPoint(node: DiagramNode, point: DiagramNode["position"]) {
  return (
    point.x >= node.position.x &&
    point.x <= node.position.x + node.size.width &&
    point.y >= node.position.y &&
    point.y <= node.position.y + node.size.height
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
