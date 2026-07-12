import type { DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "./area-nodes";

const PARENT_AREA_EXPANSION_MULTIPLIER = 1.5;

export function expandParentAreaNodesForEnteredChild(
  nodes: readonly DiagramNode[],
  childNodeId: string
): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const child = nodeById.get(childNodeId);

  if (!child) {
    return [...nodes];
  }

  const visited = new Set<string>([child.id]);
  const widthIncrease = child.size.width * PARENT_AREA_EXPANSION_MULTIPLIER;
  const heightIncrease = child.size.height * PARENT_AREA_EXPANSION_MULTIPLIER;
  let parentId = child.metadata?.parentAreaNodeId;

  while (parentId && !visited.has(parentId)) {
    const parent = nodeById.get(parentId);

    if (!parent || !isAreaNode(parent)) {
      break;
    }

    visited.add(parentId);
    const expanded = {
      ...parent,
      position: {
        x: parent.position.x - widthIncrease / 2,
        y: parent.position.y - heightIncrease / 2
      },
      size: {
        width: parent.size.width + widthIncrease,
        height: parent.size.height + heightIncrease
      }
    };
    nodeById.set(parent.id, expanded);
    parentId = expanded.metadata?.parentAreaNodeId;
  }

  return nodes.map((node) => nodeById.get(node.id) ?? node);
}
