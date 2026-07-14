import type { DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "./area-nodes";

const AREA_CHILD_HORIZONTAL_PADDING = 12;
const AREA_CHILD_TOP_PADDING = 28;
const AREA_CHILD_BOTTOM_PADDING = 12;

type AreaGeometry = {
  position: DiagramNode["position"];
  size: DiagramNode["size"];
};

export function reconcileAreaNodeGeometry(
  previousNodes: readonly DiagramNode[],
  currentNodes: readonly DiagramNode[],
  changedNodeIds: ReadonlySet<string>
): DiagramNode[] {
  if (changedNodeIds.size === 0) {
    return [...currentNodes];
  }

  const previousNodeById = new Map(previousNodes.map((node) => [node.id, node]));
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  translateOrReplaceChangedAreaBaselines(previousNodeById, currentNodeById, changedNodeIds);

  const directChildIdsByAreaId = groupDirectChildIds(currentNodeById.values());
  const affectedAreaIds = collectAffectedAreaIds(
    previousNodeById,
    currentNodeById,
    changedNodeIds
  );
  const orderedAreaIds = [...affectedAreaIds].sort(
    (leftId, rightId) =>
      getAreaDepth(rightId, currentNodeById) - getAreaDepth(leftId, currentNodeById)
  );

  for (const areaId of orderedAreaIds) {
    const area = currentNodeById.get(areaId);

    if (!area || !isAreaNode(area) || hasParentCycle(area.id, currentNodeById)) {
      continue;
    }

    const childNodes = (directChildIdsByAreaId.get(area.id) ?? [])
      .map((childId) => currentNodeById.get(childId))
      .filter((node): node is DiagramNode => Boolean(node));

    currentNodeById.set(area.id, reconcileArea(area, childNodes));
  }

  return currentNodes.map((node) => currentNodeById.get(node.id) ?? node);
}

function translateOrReplaceChangedAreaBaselines(
  previousNodeById: ReadonlyMap<string, DiagramNode>,
  currentNodeById: Map<string, DiagramNode>,
  changedNodeIds: ReadonlySet<string>
): void {
  for (const nodeId of changedNodeIds) {
    const currentNode = currentNodeById.get(nodeId);
    const previousNode = previousNodeById.get(nodeId);
    const baseline = currentNode?.metadata?.areaAutoSizeBaseline;

    if (!currentNode || !previousNode || !baseline || !isAreaNode(currentNode)) {
      continue;
    }

    const sizeChanged =
      currentNode.size.width !== previousNode.size.width ||
      currentNode.size.height !== previousNode.size.height;
    const positionChanged =
      currentNode.position.x !== previousNode.position.x ||
      currentNode.position.y !== previousNode.position.y;

    if (sizeChanged) {
      currentNodeById.set(
        nodeId,
        setAreaAutoSizeBaseline(currentNode, geometryOf(currentNode))
      );
      continue;
    }

    if (positionChanged) {
      currentNodeById.set(
        nodeId,
        setAreaAutoSizeBaseline(currentNode, {
          position: {
            x: baseline.position.x + currentNode.position.x - previousNode.position.x,
            y: baseline.position.y + currentNode.position.y - previousNode.position.y
          },
          size: { ...baseline.size }
        })
      );
    }
  }
}

function collectAffectedAreaIds(
  previousNodeById: ReadonlyMap<string, DiagramNode>,
  currentNodeById: ReadonlyMap<string, DiagramNode>,
  changedNodeIds: ReadonlySet<string>
): Set<string> {
  const affectedAreaIds = new Set<string>();

  for (const nodeId of changedNodeIds) {
    const previousNode = previousNodeById.get(nodeId);
    const currentNode = currentNodeById.get(nodeId);

    if (currentNode && isAreaNode(currentNode)) {
      affectedAreaIds.add(currentNode.id);
    }
    if (previousNode?.metadata?.parentAreaNodeId) {
      affectedAreaIds.add(previousNode.metadata.parentAreaNodeId);
    }
    if (currentNode?.metadata?.parentAreaNodeId) {
      affectedAreaIds.add(currentNode.metadata.parentAreaNodeId);
    }
  }

  const pendingAreaIds = [...affectedAreaIds];

  while (pendingAreaIds.length > 0) {
    const areaId = pendingAreaIds.pop();

    if (!areaId) {
      continue;
    }

    const parentAreaNodeId =
      currentNodeById.get(areaId)?.metadata?.parentAreaNodeId ??
      previousNodeById.get(areaId)?.metadata?.parentAreaNodeId;

    if (parentAreaNodeId && !affectedAreaIds.has(parentAreaNodeId)) {
      affectedAreaIds.add(parentAreaNodeId);
      pendingAreaIds.push(parentAreaNodeId);
    }
  }

  return affectedAreaIds;
}

function groupDirectChildIds(nodes: Iterable<DiagramNode>): Map<string, string[]> {
  const childIdsByAreaId = new Map<string, string[]>();

  for (const node of nodes) {
    const parentAreaNodeId = node.metadata?.parentAreaNodeId;

    if (!parentAreaNodeId) {
      continue;
    }

    const childIds = childIdsByAreaId.get(parentAreaNodeId) ?? [];
    childIds.push(node.id);
    childIdsByAreaId.set(parentAreaNodeId, childIds);
  }

  return childIdsByAreaId;
}

function reconcileArea(area: DiagramNode, directChildren: readonly DiagramNode[]): DiagramNode {
  const storedBaseline = area.metadata?.areaAutoSizeBaseline;

  if (directChildren.length === 0) {
    return storedBaseline
      ? removeAreaAutoSizeBaseline({
          ...area,
          position: { ...storedBaseline.position },
          size: { ...storedBaseline.size }
        })
      : area;
  }

  const baseline = storedBaseline ?? geometryOf(area);
  const childBounds = getPaddedChildBounds(directChildren);
  const left = Math.min(baseline.position.x, childBounds.left);
  const top = Math.min(baseline.position.y, childBounds.top);
  const right = Math.max(
    baseline.position.x + baseline.size.width,
    childBounds.right
  );
  const bottom = Math.max(
    baseline.position.y + baseline.size.height,
    childBounds.bottom
  );

  return setAreaAutoSizeBaseline(
    {
      ...area,
      position: { x: left, y: top },
      size: { width: right - left, height: bottom - top }
    },
    baseline
  );
}

function getPaddedChildBounds(directChildren: readonly DiagramNode[]) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const child of directChildren) {
    left = Math.min(left, child.position.x - AREA_CHILD_HORIZONTAL_PADDING);
    top = Math.min(top, child.position.y - AREA_CHILD_TOP_PADDING);
    right = Math.max(
      right,
      child.position.x + child.size.width + AREA_CHILD_HORIZONTAL_PADDING
    );
    bottom = Math.max(
      bottom,
      child.position.y + child.size.height + AREA_CHILD_BOTTOM_PADDING
    );
  }

  return { bottom, left, right, top };
}

function setAreaAutoSizeBaseline(node: DiagramNode, baseline: AreaGeometry): DiagramNode {
  return {
    ...node,
    metadata: {
      ...node.metadata,
      areaAutoSizeBaseline: {
        position: { ...baseline.position },
        size: { ...baseline.size }
      }
    }
  };
}

function removeAreaAutoSizeBaseline(node: DiagramNode): DiagramNode {
  const { areaAutoSizeBaseline: _baseline, ...metadata } = node.metadata ?? {};

  return {
    ...node,
    ...(Object.keys(metadata).length > 0 ? { metadata } : { metadata: undefined })
  };
}

function geometryOf(node: DiagramNode): AreaGeometry {
  return {
    position: { ...node.position },
    size: { ...node.size }
  };
}

function getAreaDepth(
  areaId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): number {
  let depth = 0;
  let parentAreaNodeId = nodeById.get(areaId)?.metadata?.parentAreaNodeId;
  const visitedAreaIds = new Set<string>([areaId]);

  while (parentAreaNodeId && !visitedAreaIds.has(parentAreaNodeId)) {
    depth += 1;
    visitedAreaIds.add(parentAreaNodeId);
    parentAreaNodeId = nodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return depth;
}

function hasParentCycle(
  areaId: string,
  nodeById: ReadonlyMap<string, DiagramNode>
): boolean {
  let parentAreaNodeId = nodeById.get(areaId)?.metadata?.parentAreaNodeId;
  const visitedAreaIds = new Set<string>([areaId]);

  while (parentAreaNodeId) {
    if (visitedAreaIds.has(parentAreaNodeId)) {
      return true;
    }

    visitedAreaIds.add(parentAreaNodeId);
    parentAreaNodeId = nodeById.get(parentAreaNodeId)?.metadata?.parentAreaNodeId;
  }

  return false;
}
