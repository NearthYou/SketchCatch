import {
  isBoardAutoPresentationFrameNode,
  type DiagramJson,
  type DiagramNode
} from "@sketchcatch/types";

/** Web Compiler 안에서 full-tuple 자동 프레임 소유권을 같은 이름으로 노출합니다. */
export function isOwnedAutoFrame(node: DiagramNode): boolean {
  return isBoardAutoPresentationFrameNode(node);
}

/** 잠긴 자동 프레임과 사용자 Design을 지키면서 허용된 자동 프레임만 교체합니다. */
export function reconcilePresentationFrames(
  sourceDiagram: DiagramJson,
  candidateDiagram: DiagramJson = sourceDiagram
): DiagramJson {
  const sourceOwnedFrameById = new Map(
    sourceDiagram.nodes.filter(isOwnedAutoFrame).map((node) => [node.id, node])
  );
  const protectedUserDesignById = new Map(
    sourceDiagram.nodes
      .filter((node) => node.kind === "design" && !isOwnedAutoFrame(node))
      .map((node) => [node.id, node])
  );
  const lockedFrames = sourceDiagram.nodes.filter(
    (node) => isOwnedAutoFrame(node) && node.locked
  );
  const reservedIds = new Set([
    ...protectedUserDesignById.keys(),
    ...lockedFrames.map((node) => node.id)
  ]);
  const candidateNodes = candidateDiagram.nodes.filter(
    (node) => !isOwnedAutoFrame(node) && !sourceOwnedFrameById.has(node.id)
  );
  const candidateNodeIds = new Set(candidateNodes.map((node) => node.id));
  const missingUserDesignNodes = [...protectedUserDesignById.values()].filter(
    (node) => !candidateNodeIds.has(node.id)
  );
  const desiredFrames = candidateDiagram.nodes
    .filter((node) => isOwnedAutoFrame(node) && !node.locked && !reservedIds.has(node.id))
    .map(normalizeOwnedAutoFrame)
    .filter((node): node is DiagramNode => node !== null)
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    ...structuredClone(candidateDiagram),
    nodes: [
      ...candidateNodes.map((node) => structuredClone(node)),
      ...missingUserDesignNodes.map((node) => structuredClone(node)),
      ...lockedFrames.map((node) => structuredClone(node)),
      ...desiredFrames
    ]
  };
}

/** 자동 프레임에서 parent와 Terraform 값을 제거하고 낮은 화면 층만 허용합니다. */
function normalizeOwnedAutoFrame(node: DiagramNode): DiagramNode | null {
  if (!hasFiniteGeometry(node)) {
    return null;
  }

  const { parameters: _parameters, ...frame } = structuredClone(node);

  return {
    ...frame,
    kind: "design",
    type: "design_group",
    locked: false,
    zIndex: Math.min(0, Number.isFinite(frame.zIndex) ? frame.zIndex : 0),
    metadata: { presentationCatalogItemId: "design-group" }
  };
}

/** 저장 가능한 유한 좌표와 양수 크기인지 확인합니다. */
function hasFiniteGeometry(node: DiagramNode): boolean {
  return (
    Number.isFinite(node.position.x) &&
    Number.isFinite(node.position.y) &&
    Number.isFinite(node.size.width) &&
    Number.isFinite(node.size.height) &&
    node.size.width > 0 &&
    node.size.height > 0
  );
}
