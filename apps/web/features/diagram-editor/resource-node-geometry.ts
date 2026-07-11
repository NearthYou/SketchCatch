import type { DiagramJson, DiagramNode } from "../../../../packages/types/src";

import { isAreaNode } from "./area-nodes";

export const RESOURCE_NODE_DEFAULT_SIZE = { width: 48, height: 48 } as const;
export const RESOURCE_NODE_COMPACT_MIN_SIZE = { width: 28, height: 28 } as const;

const LEGACY_RESOURCE_NODE_SIDES = new Set([48, 56]);

export function normalizeDiagramResourceNodeGeometry(diagram: DiagramJson): DiagramJson {
  let didChange = false;
  const nodes = diagram.nodes.map((node) => {
    const normalizedNode = normalizeResourceNodeGeometry(node);

    if (normalizedNode !== node) {
      didChange = true;
    }

    return normalizedNode;
  });

  return didChange ? { ...diagram, nodes } : diagram;
}

function normalizeResourceNodeGeometry(node: DiagramNode): DiagramNode {
  if (node.kind !== "resource" || isAreaNode(node)) {
    return node;
  }

  const isLegacyDefault =
    node.size.width === node.size.height && LEGACY_RESOURCE_NODE_SIDES.has(node.size.width);
  const nextSize = isLegacyDefault
    ? RESOURCE_NODE_DEFAULT_SIZE
    : {
        width: Math.max(RESOURCE_NODE_COMPACT_MIN_SIZE.width, node.size.width),
        height: Math.max(RESOURCE_NODE_COMPACT_MIN_SIZE.height, node.size.height)
      };

  if (nextSize.width === node.size.width && nextSize.height === node.size.height) {
    return node;
  }

  return {
    ...node,
    position: {
      x: node.position.x + (node.size.width - nextSize.width) / 2,
      y: node.position.y + (node.size.height - nextSize.height) / 2
    },
    size: { ...nextSize }
  };
}
