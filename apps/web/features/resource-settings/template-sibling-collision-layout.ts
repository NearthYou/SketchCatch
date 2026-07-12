import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "../diagram-editor/area-nodes";
import { isRenderableDiagramNode } from "../diagram-editor/diagram-node-visibility";
import {
  getResourceNodeVisualBounds,
  type BoardVisualBounds
} from "../diagram-editor/resource-node-visual-footprint";

const ROOT_PARENT_ID = "__template_collision_root__";
const AREA_VISUAL_PADDING = 56;
const MAX_PLACEMENT_STEPS_PER_NODE = 1_000;

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
  centerCollapsedHelpersInsideParents(nodeById);
  const childrenByParentId = createRenderableChildrenByParentId(nodeById);
  const parentIds = [...childrenByParentId.keys()].sort(
    (left, right) => getParentDepth(right, nodeById) - getParentDepth(left, nodeById)
  );

  for (const parentId of parentIds) {
    separateSiblingVisualBounds(parentId, childrenByParentId, nodeById, gridSize);
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

function separateSiblingVisualBounds(
  parentId: string,
  childrenByParentId: ReadonlyMap<string, readonly string[]>,
  nodeById: Map<string, DiagramNode>,
  gridSize: number
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

    while (placedIds.some((placedId) => nodesIntersect(nodeById, siblingId, placedId))) {
      moveSubtree(nodeById, siblingId, { x: 0, y: gridSize });
      placementSteps += 1;

      if (placementSteps > MAX_PLACEMENT_STEPS_PER_NODE) {
        throw new Error(`Unable to place Template node without overlap: ${siblingId}`);
      }
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

function nodesIntersect(
  nodeById: ReadonlyMap<string, DiagramNode>,
  leftId: string,
  rightId: string
): boolean {
  return boundsIntersect(
    getResourceNodeVisualBounds(requireNode(nodeById, leftId)),
    getResourceNodeVisualBounds(requireNode(nodeById, rightId))
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
