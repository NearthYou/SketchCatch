import { isDeepStrictEqual } from "node:util";
import {
  isBoardAutoPresentationFrameNode,
  type DiagramEdge,
  type DiagramEdgeRoute,
  type DiagramJson,
  type DiagramNode
} from "@sketchcatch/types";

const BOARD_COORDINATE_LIMIT = 1_000_000;
const MAX_SVG_PATH_LENGTH = 100_000;
const MAX_ROUTE_WAYPOINTS = 10_000;
const RESOURCE_NODE_RESIZE_BOUNDS = {
  minWidth: 28,
  minHeight: 28,
  maxWidth: 260,
  maxHeight: 260
} as const;
const DESIGN_NODE_RESIZE_BOUNDS = {
  minWidth: 140,
  minHeight: 100,
  maxWidth: 840,
  maxHeight: 640
} as const;
const DESIGN_AREA_TYPES = new Set([
  "design-group",
  "design_region",
  "design-aws-account",
  "design_az",
  "design_group",
  "sketchcatch_region",
  "sketchcatch_aws_account",
  "sketchcatch_az",
  "sketchcatch_group"
]);
const RESOURCE_AREA_MIN_SIZE_BY_TYPE = new Map<string, { minHeight: number; minWidth: number }>([
  ["aws_region", { minHeight: 90, minWidth: 130 }],
  ["aws_availability_zone", { minHeight: 75, minWidth: 110 }],
  ["aws_vpc", { minHeight: 80, minWidth: 120 }],
  ["aws_subnet", { minHeight: 56, minWidth: 72 }],
  ["aws_security_group", { minHeight: 56, minWidth: 72 }]
]);
const SVG_PATH_COMMAND_ARITY = new Map<string, number>([
  ["a", 7],
  ["c", 6],
  ["h", 1],
  ["l", 2],
  ["m", 2],
  ["q", 4],
  ["s", 4],
  ["t", 2],
  ["v", 1],
  ["z", 0]
]);
const SVG_PATH_TOKEN_PATTERN =
  /[AaCcHhLlMmQqSsTtVvZz]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/giy;

/** 저장된 원본 위에 검증된 위치·크기·route·자동 프레임만 다시 조립합니다. */
export function recomposeBoardAutoOrganizeDiagram(
  sourceDiagram: DiagramJson,
  candidateDiagram: DiagramJson
): DiagramJson {
  const sourceNodeById = createUniqueItemMap(sourceDiagram.nodes);
  const candidateNodeById = createUniqueItemMap(candidateDiagram.nodes);
  const sourceEdgeById = createUniqueItemMap(sourceDiagram.edges);
  const candidateEdgeById = createUniqueItemMap(candidateDiagram.edges);

  if (!sourceNodeById || !candidateNodeById || !sourceEdgeById || !candidateEdgeById) {
    throw new BoardAutoOrganizeSemanticMismatchError();
  }

  const sourceEdgeEndpointIds = new Set(
    sourceDiagram.edges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId])
  );
  const nodes: DiagramNode[] = [];

  for (const sourceNode of sourceDiagram.nodes) {
    const candidateNode = candidateNodeById.get(sourceNode.id);

    if (isBoardAutoPresentationFrameNode(sourceNode)) {
      if (sourceNode.locked) {
        if (!candidateNode || !isDeepStrictEqual(sourceNode, candidateNode)) {
          throw new BoardAutoOrganizeSemanticMismatchError();
        }

        nodes.push(structuredClone(sourceNode));
        continue;
      }

      if (!candidateNode) {
        if (sourceEdgeEndpointIds.has(sourceNode.id)) {
          nodes.push(structuredClone(sourceNode));
        }
        continue;
      }

      if (!isBoardAutoPresentationFrameNode(candidateNode) || candidateNode.locked) {
        throw new BoardAutoOrganizeSemanticMismatchError();
      }

      if (isDeepStrictEqual(sourceNode, candidateNode)) {
        nodes.push(structuredClone(sourceNode));
        continue;
      }

      assertValidNodeGeometry(candidateNode, sourceNode);
      nodes.push(normalizeBoardAutoPresentationFrame(candidateNode));
      continue;
    }

    if (!candidateNode || isBoardAutoPresentationFrameNode(candidateNode)) {
      throw new BoardAutoOrganizeSemanticMismatchError();
    }

    const geometryChanged = !hasSameNodeGeometry(sourceNode, candidateNode);

    if (sourceNode.locked && geometryChanged) {
      throw new BoardAutoOrganizeSemanticMismatchError();
    }

    if (geometryChanged) {
      assertValidNodeGeometry(candidateNode, sourceNode);
    }

    nodes.push({
      ...structuredClone(sourceNode),
      position: structuredClone(sourceNode.locked ? sourceNode.position : candidateNode.position),
      size: structuredClone(sourceNode.locked ? sourceNode.size : candidateNode.size)
    });
  }

  for (const candidateNode of candidateDiagram.nodes) {
    if (sourceNodeById.has(candidateNode.id)) {
      continue;
    }

    if (!isBoardAutoPresentationFrameNode(candidateNode) || candidateNode.locked) {
      throw new BoardAutoOrganizeSemanticMismatchError();
    }

    assertValidNodeGeometry(candidateNode);
    nodes.push(normalizeBoardAutoPresentationFrame(candidateNode));
  }

  const edges = sourceDiagram.edges.map((sourceEdge) => {
    const candidateEdge = candidateEdgeById.get(sourceEdge.id);

    if (!candidateEdge) {
      throw new BoardAutoOrganizeSemanticMismatchError();
    }

    if (
      !isDeepStrictEqual(sourceEdge.route, candidateEdge.route) &&
      candidateEdge.route !== undefined &&
      !hasValidBoardAutoOrganizeRoute(candidateEdge.route)
    ) {
      throw new BoardAutoOrganizeSemanticMismatchError();
    }

    return recomposeBoardAutoOrganizeEdge(sourceEdge, candidateEdge);
  });

  return {
    ...structuredClone(sourceDiagram),
    nodes,
    edges
  };
}

/** 자동 프레임은 제목·geometry·style과 네 가지 소유권 값만 저장합니다. */
function normalizeBoardAutoPresentationFrame(node: DiagramNode): DiagramNode {
  return {
    id: node.id,
    type: "design_group",
    kind: "design",
    position: structuredClone(node.position),
    size: structuredClone(node.size),
    label: node.label,
    locked: false,
    zIndex: Math.min(0, node.zIndex),
    ...(node.style === undefined ? {} : { style: structuredClone(node.style) }),
    metadata: { presentationCatalogItemId: "design-group" }
  };
}

/** edge 의미는 원본에서 가져오고 route와 handle만 후보에서 채택합니다. */
function recomposeBoardAutoOrganizeEdge(
  sourceEdge: DiagramEdge,
  candidateEdge: DiagramEdge
): DiagramEdge {
  const {
    route: _sourceRoute,
    sourceHandleId: _sourceHandleId,
    targetHandleId: _targetHandleId,
    ...semanticEdge
  } = structuredClone(sourceEdge);

  return {
    ...semanticEdge,
    ...(candidateEdge.sourceHandleId === undefined
      ? {}
      : { sourceHandleId: candidateEdge.sourceHandleId }),
    ...(candidateEdge.targetHandleId === undefined
      ? {}
      : { targetHandleId: candidateEdge.targetHandleId }),
    ...(candidateEdge.route === undefined ? {} : { route: structuredClone(candidateEdge.route) })
  };
}

/** node ID 중복은 allowlist 재조합의 대상 결정을 모호하게 하므로 거부합니다. */
function createUniqueItemMap<T extends { readonly id: string }>(
  items: readonly T[]
): Map<string, T> | null {
  const itemById = new Map<string, T>();

  for (const item of items) {
    if (itemById.has(item.id)) {
      return null;
    }
    itemById.set(item.id, item);
  }

  return itemById;
}

/** 잠금 검사와 변경 geometry 검증에 같은 위치·크기 비교를 사용합니다. */
function hasSameNodeGeometry(left: DiagramNode, right: DiagramNode): boolean {
  return (
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.size.width === right.size.width &&
    left.size.height === right.size.height
  );
}

/** Board 좌표 한계와 Editor의 node 종류별 resize 범위를 서버에서도 강제합니다. */
function assertValidNodeGeometry(node: DiagramNode, sourceNode?: DiagramNode): void {
  const bounds = getNodeResizeBounds(node);
  const minWidth = getEffectiveResizeMinimum(bounds.minWidth, sourceNode?.size.width);
  const minHeight = getEffectiveResizeMinimum(bounds.minHeight, sourceNode?.size.height);
  const isValid =
    isBoardCoordinate(node.position.x) &&
    isBoardCoordinate(node.position.y) &&
    Number.isFinite(node.size.width) &&
    Number.isFinite(node.size.height) &&
    node.size.width >= minWidth &&
    node.size.width <= bounds.maxWidth &&
    node.size.height >= minHeight &&
    node.size.height <= bounds.maxHeight;

  if (!isValid) {
    throw new BoardAutoOrganizeSemanticMismatchError();
  }
}

/** 이미 저장된 작은 legacy 크기는 보존하되 그 값보다 더 줄이는 후보는 거부합니다. */
function getEffectiveResizeMinimum(editorMinimum: number, sourceValue: number | undefined): number {
  return sourceValue !== undefined && Number.isFinite(sourceValue) && sourceValue > 0
    ? Math.min(editorMinimum, sourceValue)
    : editorMinimum;
}

/** Web Editor의 resize 범위에 서버 안전 상한을 더한 node 종류별 최소·최대값입니다. */
function getNodeResizeBounds(node: DiagramNode): {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
} {
  if (node.kind === "design") {
    if (DESIGN_AREA_TYPES.has(node.type)) {
      return {
        minWidth: 48,
        minHeight: 36,
        maxWidth: BOARD_COORDINATE_LIMIT,
        maxHeight: BOARD_COORDINATE_LIMIT
      };
    }

    return node.iconUrl ? RESOURCE_NODE_RESIZE_BOUNDS : DESIGN_NODE_RESIZE_BOUNDS;
  }

  const resourceType = node.parameters?.resourceType ?? node.type;
  const areaMinimum = RESOURCE_AREA_MIN_SIZE_BY_TYPE.get(resourceType);

  return areaMinimum
    ? {
        ...areaMinimum,
        maxWidth: BOARD_COORDINATE_LIMIT,
        maxHeight: BOARD_COORDINATE_LIMIT
      }
    : RESOURCE_NODE_RESIZE_BOUNDS;
}

/** route control point와 node position이 사용할 수 있는 유한 좌표 범위입니다. */
function isBoardCoordinate(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= BOARD_COORDINATE_LIMIT;
}

/** route의 모든 point와 실제 SVG path 문법·수치 범위를 함께 검증합니다. */
function hasValidBoardAutoOrganizeRoute(route: DiagramEdgeRoute): boolean {
  return (
    route.waypoints.length <= MAX_ROUTE_WAYPOINTS &&
    isValidSvgPath(route.svgPath) &&
    isBoardPoint(route.sourcePoint) &&
    isBoardPoint(route.targetPoint) &&
    route.waypoints.every(isBoardPoint) &&
    (route.labelPosition === undefined || isBoardPoint(route.labelPosition)) &&
    (route.arrowAngle === undefined || Number.isFinite(route.arrowAngle))
  );
}

/** SVG path를 명령 arity까지 파싱해 자유 문자열과 비유한·폭주 좌표를 차단합니다. */
function isValidSvgPath(svgPath: string): boolean {
  if (svgPath.length === 0 || svgPath.length > MAX_SVG_PATH_LENGTH) {
    return false;
  }

  const tokens = tokenizeSvgPath(svgPath);

  if (!tokens || typeof tokens[0] !== "string" || tokens[0].toLowerCase() !== "m") {
    return false;
  }

  let tokenIndex = 0;

  while (tokenIndex < tokens.length) {
    const command = tokens[tokenIndex];

    if (typeof command !== "string") {
      return false;
    }

    // 상대 명령은 각 token이 범위 안이어도 누적 좌표가 서버 상한을 넘을 수 있습니다.
    if (command !== command.toUpperCase()) {
      return false;
    }

    const normalizedCommand = command.toLowerCase();
    const arity = SVG_PATH_COMMAND_ARITY.get(normalizedCommand);

    if (arity === undefined) {
      return false;
    }

    tokenIndex += 1;
    const parameterStart = tokenIndex;

    while (tokenIndex < tokens.length && typeof tokens[tokenIndex] === "number") {
      tokenIndex += 1;
    }

    const parameterCount = tokenIndex - parameterStart;

    if (arity === 0) {
      if (parameterCount !== 0) {
        return false;
      }
      continue;
    }

    if (parameterCount === 0 || parameterCount % arity !== 0) {
      return false;
    }

    if (normalizedCommand === "a") {
      for (let index = parameterStart; index < tokenIndex; index += arity) {
        const radiusX = tokens[index];
        const radiusY = tokens[index + 1];
        const largeArcFlag = tokens[index + 3];
        const sweepFlag = tokens[index + 4];

        if (
          typeof radiusX !== "number" ||
          typeof radiusY !== "number" ||
          radiusX < 0 ||
          radiusY < 0 ||
          (largeArcFlag !== 0 && largeArcFlag !== 1) ||
          (sweepFlag !== 0 && sweepFlag !== 1)
        ) {
          return false;
        }
      }
    }
  }

  return true;
}

/** SVG command와 finite number만 소비하며 다른 문자가 하나라도 있으면 실패합니다. */
function tokenizeSvgPath(svgPath: string): Array<string | number> | null {
  const tokens: Array<string | number> = [];
  let cursor = 0;

  while (cursor < svgPath.length) {
    while (cursor < svgPath.length && /[\s,]/u.test(svgPath[cursor]!)) {
      cursor += 1;
    }

    if (cursor >= svgPath.length) {
      break;
    }

    SVG_PATH_TOKEN_PATTERN.lastIndex = cursor;
    const match = SVG_PATH_TOKEN_PATTERN.exec(svgPath);

    if (!match || match.index !== cursor) {
      return null;
    }

    const token = match[0];

    if (/^[A-Za-z]$/u.test(token)) {
      tokens.push(token);
    } else {
      const value = Number(token);

      if (!isBoardCoordinate(value)) {
        return null;
      }

      tokens.push(value);
    }

    cursor = SVG_PATH_TOKEN_PATTERN.lastIndex;
  }

  return tokens.length > 0 ? tokens : null;
}

/** route point가 화면 좌표의 authoritative 범위 안에 있는지 확인합니다. */
function isBoardPoint(point: { readonly x: number; readonly y: number }): boolean {
  return isBoardCoordinate(point.x) && isBoardCoordinate(point.y);
}

/** Resource·설정·연결 의미와 서버 visual policy를 벗어난 후보를 거부합니다. */
export class BoardAutoOrganizeSemanticMismatchError extends Error {
  /** 사용자에게 Compiler 세부 정보가 없는 안전한 오류를 만듭니다. */
  constructor() {
    super("화면 정리 범위를 벗어난 변경은 적용할 수 없습니다.");
    this.name = "BoardAutoOrganizeSemanticMismatchError";
  }
}
