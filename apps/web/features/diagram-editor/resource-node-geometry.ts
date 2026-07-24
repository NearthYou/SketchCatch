import {
  isBoardAutoPresentationFrameNode,
  type DiagramJson,
  type DiagramNode
} from "../../../../packages/types/src";

import { isAreaNode, isContainmentAreaNode } from "./area-nodes";

export const RESOURCE_NODE_DEFAULT_SIZE = { width: 48, height: 48 } as const;
export const RESOURCE_NODE_COMPACT_MIN_SIZE = { width: 28, height: 28 } as const;

const LEGACY_RESOURCE_NODE_SIDES = new Set([48, 56]);

/** 저장된 icon geometry와 더는 유효하지 않은 Area parent를 현재 Board 규칙으로 올립니다. */
export function normalizeDiagramResourceNodeGeometry(diagram: DiagramJson): DiagramJson {
  if (diagram.presentation?.geometryPolicy === "source-exact") {
    return diagram;
  }

  let didChange = false;
  const geometryNodes = diagram.nodes.map((node) => {
    const normalizedNode = normalizeResourceNodeGeometry(node);

    if (normalizedNode !== node) {
      didChange = true;
    }

    return normalizedNode;
  });
  const nodeById = new Map(geometryNodes.map((node) => [node.id, node]));
  const nodes = geometryNodes.map((node) => {
    const normalizedNode = normalizeResourceNodeParent(node, nodeById);

    if (normalizedNode !== node) {
      didChange = true;
    }

    return normalizedNode;
  });

  return didChange ? { ...diagram, nodes } : diagram;
}

/** 예전 icon 기본 크기를 중앙 기준으로 축소합니다. */
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

/** SG 같은 visual-only parent를 건너뛰어 가장 가까운 실제 Area를 복구합니다. */
function normalizeResourceNodeParent(
  node: DiagramNode,
  nodeById: ReadonlyMap<string, DiagramNode>
): DiagramNode {
  const currentParentId = node.metadata?.parentAreaNodeId;

  if (!currentParentId) {
    return node;
  }

  // 과거 저장값은 유지하되 자동 프레임을 새 containment parent로 사용하지는 않습니다.
  const currentParent = nodeById.get(currentParentId);
  if (currentParent && isBoardAutoPresentationFrameNode(currentParent)) {
    return node;
  }

  const visitedIds = new Set<string>([node.id]);
  let candidateParentId: string | undefined = currentParentId;
  let resolvedParentId: string | undefined;
  let hasParentCycle = false;

  while (candidateParentId) {
    if (visitedIds.has(candidateParentId)) {
      hasParentCycle = true;
      break;
    }

    visitedIds.add(candidateParentId);
    const candidate = nodeById.get(candidateParentId);

    if (!resolvedParentId && candidate && isContainmentAreaNode(candidate)) {
      resolvedParentId = candidate.id;
    }

    candidateParentId = candidate?.metadata?.parentAreaNodeId;
  }

  if (hasParentCycle) {
    resolvedParentId = undefined;
  }

  if (resolvedParentId === currentParentId) {
    return node;
  }

  const { parentAreaNodeId: _parentAreaNodeId, ...metadata } = node.metadata ?? {};

  return {
    ...node,
    metadata: {
      ...metadata,
      ...(resolvedParentId ? { parentAreaNodeId: resolvedParentId } : {})
    }
  };
}
