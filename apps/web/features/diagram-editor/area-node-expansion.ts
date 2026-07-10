import type { DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "./area-nodes";

export function expandParentAreaNodesForNewChild(
  nodes: readonly DiagramNode[],
  childNodeId: string
): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const child = nodeById.get(childNodeId);

  if (!child || isAreaNode(child)) {
    return [...nodes];
  }

  const visited = new Set<string>([child.id]);
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
        x: parent.position.x - child.size.width,
        y: parent.position.y - child.size.height
      },
      size: {
        width: parent.size.width + child.size.width * 2,
        height: parent.size.height + child.size.height * 2
      }
    };
    nodeById.set(parent.id, expanded);
    parentId = expanded.metadata?.parentAreaNodeId;
  }

  return nodes.map((node) => nodeById.get(node.id) ?? node);
}
