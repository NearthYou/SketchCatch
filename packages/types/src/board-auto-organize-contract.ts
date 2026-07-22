import type { DiagramEdge, DiagramJson, DiagramNode, DiagramVariable } from "./index.ts";

export const BOARD_AUTO_FRAME_ID_PREFIX = "board-auto-frame:";
export const BOARD_AUTO_ORGANIZE_SAFETY_EXPLANATION =
  "Resource, 설정, 연결 관계는 바뀌지 않았습니다.";

export type BoardAutoOrganizeVisualDiff = {
  readonly movedNodeIds: readonly string[];
  readonly resizedNodeIds: readonly string[];
  readonly reroutedEdgeIds: readonly string[];
  readonly addedFrameIds: readonly string[];
  readonly changedFrameIds: readonly string[];
  readonly removedFrameIds: readonly string[];
};

export type BoardAutoOrganizeCandidate = {
  id: string;
  diagram: DiagramJson;
  visualDiff: BoardAutoOrganizeVisualDiff;
  explanations: readonly string[];
  visualFingerprint: string;
};

export type BoardAutoOrganizeCandidateSet = {
  sessionId: string;
  sourceFingerprint: string;
  candidates: readonly BoardAutoOrganizeCandidate[];
};

const TRANSIENT_SELECTION_KEYS = new Set([
  "selected",
  "selection",
  "selectedEdgeId",
  "selectedEdgeIds",
  "selectedNodeId",
  "selectedNodeIds"
]);

/** 네 가지 소유권 값이 모두 맞는 자동 생성 표시 프레임만 식별합니다. */
export function isBoardAutoPresentationFrameNode(node: DiagramNode): boolean {
  return (
    node.kind === "design" &&
    node.type === "design_group" &&
    node.metadata?.presentationCatalogItemId === "design-group" &&
    node.id.startsWith(BOARD_AUTO_FRAME_ID_PREFIX)
  );
}

/** 저장된 시각 상태를 포함하되 viewport와 일시 선택만 뺀 원본을 안정적으로 직렬화합니다. */
export function serializeBoardAutoOrganizeSource(diagram: DiagramJson): string {
  const source = omitTransientSelectionFields(diagram as unknown as Record<string, unknown>);
  delete source.viewport;

  return stableSerialize({
    ...source,
    nodes: sortById(diagram.nodes).map((node) =>
      omitTransientSelectionFields(node as unknown as Record<string, unknown>)
    ),
    edges: sortById(diagram.edges).map((edge) =>
      omitTransientSelectionFields(edge as unknown as Record<string, unknown>)
    ),
    ...(diagram.variables === undefined ? {} : { variables: sortVariables(diagram.variables) })
  });
}

/** source serializer를 브라우저와 서버가 공유하는 UTF-16 FNV-1a 8자리 값으로 줄입니다. */
export function createBoardAutoOrganizeSourceFingerprint(diagram: DiagramJson): string {
  return createBoardAutoOrganizeFingerprint(serializeBoardAutoOrganizeSource(diagram));
}

/** 자동 정리가 바꿀 수 없는 Resource·설정·관계·presentation을 안정적으로 직렬화합니다. */
export function serializeBoardAutoOrganizeSemantics(diagram: DiagramJson): string {
  return stableSerialize({
    nodes: sortById(diagram.nodes)
      .filter((node) => !isBoardAutoPresentationFrameNode(node))
      .map(({ position: _position, size: _size, ...node }) =>
        omitTransientSelectionFields(node as unknown as Record<string, unknown>)
      ),
    edges: sortById(diagram.edges).map(toSemanticEdge),
    ...(diagram.variables === undefined ? {} : { variables: sortVariables(diagram.variables) }),
    ...(diagram.presentation === undefined ? {} : { presentation: diagram.presentation })
  });
}

/** 두 Diagram이 자동 정리에서 보호하는 의미를 정확히 같이 가지는지 확인합니다. */
export function hasSameBoardAutoOrganizeSemantics(
  source: DiagramJson,
  candidate: DiagramJson
): boolean {
  return (
    serializeBoardAutoOrganizeSemantics(source) === serializeBoardAutoOrganizeSemantics(candidate)
  );
}

/** route 좌표와 handle은 빼고 관계 방향·화면 층을 포함한 나머지 edge 의미를 남깁니다. */
function toSemanticEdge(edge: DiagramEdge): unknown {
  const {
    route,
    sourceHandleId: _sourceHandleId,
    targetHandleId: _targetHandleId,
    ...semanticEdge
  } = edge;

  return {
    ...omitTransientSelectionFields(semanticEdge as unknown as Record<string, unknown>),
    ...(route?.arrowDirection === undefined ? {} : { arrowDirection: route.arrowDirection })
  };
}

/** ID 기반 collection 순서를 고정해 저장 배열 순서가 fingerprint를 바꾸지 않게 합니다. */
function sortById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

/** 변수와 binding 순서를 고정하되 실제 변수 값은 모두 유지합니다. */
function sortVariables(variables: readonly DiagramVariable[]): DiagramVariable[] {
  return sortById(variables).map((variable) => ({
    ...variable,
    bindings: [...variable.bindings].sort(
      (left, right) =>
        left.nodeId.localeCompare(right.nodeId) ||
        left.parameterKey.localeCompare(right.parameterKey)
    )
  }));
}

/** 객체 key를 재귀 정렬해 같은 값을 같은 문자열로 만듭니다. */
function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** JSON 값의 의미를 유지하면서 object key만 결정론적으로 정렬합니다. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .flatMap((key) => {
        const entry = value[key];
        return entry === undefined ? [] : [[key, canonicalize(entry)]];
      })
  );
}

/** Diagram, node, edge의 직접 UI 선택 필드만 빼고 Resource 내부 설정은 유지합니다. */
function omitTransientSelectionFields(
  value: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !TRANSIENT_SELECTION_KEYS.has(key))
  );
}

/** 배열과 null을 제외한 plain JSON object만 좁힙니다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 안정적으로 직렬화한 Board source를 짧은 비교 값으로 만듭니다. */
function createBoardAutoOrganizeFingerprint(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
