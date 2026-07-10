import type { DiagramNode } from "../../../../packages/types/src";
import { isAreaNode } from "./area-nodes";

export function expandParentAreaNodesForChildren(
  nodes: readonly DiagramNode[],
  childNodeIds: ReadonlySet<string>
): DiagramNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const children = nodes.filter((node) => childNodeIds.has(node.id) && !isAreaNode(node));

  for (let pass = 0; pass < nodes.length; pass += 1) {
    let expandedAnyParent = false;

    for (const child of children) {
      const margin = { x: child.size.width / 2, y: child.size.height / 2 };
      const visited = new Set<string>([child.id]);
      let subject = child;
      let parentId = child.metadata?.parentAreaNodeId;

      while (parentId && !visited.has(parentId)) {
        const parent = nodeById.get(parentId);

        if (!parent || !isAreaNode(parent)) {
          break;
        }

        visited.add(parentId);
        const expanded = expandAreaToContain(parent, subject, margin);
        expandedAnyParent ||= expanded !== parent;
        nodeById.set(parent.id, expanded);
        subject = expanded;
        parentId = expanded.metadata?.parentAreaNodeId;
      }
    }

    if (!expandedAnyParent) {
      break;
    }
  }

  return nodes.map((node) => nodeById.get(node.id) ?? node);
}

function expandAreaToContain(
  parent: DiagramNode,
  child: DiagramNode,
  margin: DiagramNode["position"]
): DiagramNode {
  const left = Math.min(parent.position.x, child.position.x - margin.x);
  const top = Math.min(parent.position.y, child.position.y - margin.y);
  const right = Math.max(
    parent.position.x + parent.size.width,
    child.position.x + child.size.width + margin.x
  );
  const bottom = Math.max(
    parent.position.y + parent.size.height,
    child.position.y + child.size.height + margin.y
  );

  if (
    left === parent.position.x &&
    top === parent.position.y &&
    right === parent.position.x + parent.size.width &&
    bottom === parent.position.y + parent.size.height
  ) {
    return parent;
  }

  return {
    ...parent,
    position: { x: left, y: top },
    size: { width: right - left, height: bottom - top }
  };
}
