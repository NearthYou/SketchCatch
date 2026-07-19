import {
  hasSameBoardAutoOrganizeSemantics,
  isBoardAutoPresentationFrameNode,
  serializeBoardAutoOrganizeSource,
  type BoardAutoOrganizeCandidate,
  type BoardAutoOrganizeCandidateSet,
  type BoardAutoOrganizeVisualDiff,
  type DiagramEdgeRoute,
  type DiagramJson,
  type DiagramNode
} from "@sketchcatch/types";
import { getNodeResizeBounds } from "../diagram-editor/node-resize-bounds";
import { convertDiagramJsonToArchitectureJson } from "../workspace/workspace-ai-diagram-adapter";
import { compileArchitectureBoardCandidates } from "./architecture-board-compiler";
import { constrainBoardAutoOrganizeProposal } from "./board-auto-organize";
import { createBoardAutoOrganizeExplanations } from "./board-auto-organize-explanations";

const MAX_CANDIDATES = 3;
const BOARD_COORDINATE_LIMIT = 1_000_000;
const REGRESSION_FINDING_KEYS = [
  "nodeOverlapCount",
  "siblingAreaOverlapCount",
  "parentBoundaryViolationCount",
  "edgeNodeIntersectionCount",
  "edgeAreaTitleIntersectionCount",
  "edgeCrossingCount",
  "backwardEdgeCount",
  "supportLaneIntrusionCount"
] as const;

type RankedCandidate = {
  readonly candidate: Omit<BoardAutoOrganizeCandidate, "id">;
  readonly regressionCount: number;
  readonly regressionTotal: number;
  readonly score: number;
};

/** 현재 Board를 바꾸지 않고 서로 다른 안전한 정리안을 최대 세 개 만듭니다. */
export function createBoardAutoOrganizeCandidates(
  diagram: DiagramJson
): BoardAutoOrganizeCandidateSet {
  const sourceDiagram = structuredClone(diagram);
  const serializedSource = serializeBoardAutoOrganizeSource(sourceDiagram);
  const sourceFingerprint = createFingerprint(serializedSource);
  const proposals = compileArchitectureBoardCandidates({
    architecture: convertDiagramJsonToArchitectureJson(sourceDiagram),
    currentDiagram: sourceDiagram,
    trigger: "board-auto-organize"
  });
  const candidatesByFingerprint = new Map<string, RankedCandidate>();

  for (const proposal of proposals) {
    const constrained = constrainBoardAutoOrganizeProposal(sourceDiagram, proposal);
    const visualDiff = createBoardAutoOrganizeVisualDiff(
      sourceDiagram,
      constrained.diagram
    );

    if (
      !hasVisualChanges(visualDiff) ||
      !isSafeVisualCandidate(sourceDiagram, constrained.diagram, visualDiff)
    ) {
      continue;
    }

    const visualFingerprint = createVisualFingerprint(constrained.diagram);
    const regression = getRegressionRank(
      proposal.quality.before.metrics,
      proposal.quality.after.metrics
    );
    const candidate: RankedCandidate = {
      candidate: {
        diagram: structuredClone(constrained.diagram),
        visualDiff,
        explanations: createBoardAutoOrganizeExplanations({
          sourceDiagram,
          candidateDiagram: constrained.diagram,
          visualDiff,
          findings: {
            before: proposal.quality.before.metrics,
            after: proposal.quality.after.metrics
          }
        }),
        visualFingerprint
      },
      regressionCount: regression.count,
      regressionTotal: regression.total,
      score: proposal.quality.after.score
    };
    const previous = candidatesByFingerprint.get(visualFingerprint);

    if (!previous || compareRankedCandidates(candidate, previous) < 0) {
      candidatesByFingerprint.set(visualFingerprint, candidate);
    }
  }

  const candidates = [...candidatesByFingerprint.values()]
    .sort(compareRankedCandidates)
    .slice(0, MAX_CANDIDATES)
    .map(({ candidate }, index): BoardAutoOrganizeCandidate => ({
      id: `arrangement-${index + 1}`,
      ...candidate
    }));

  return {
    sessionId: `board-auto-session:${sourceFingerprint}`,
    sourceFingerprint,
    candidates
  };
}

/** 원본과 후보 사이에서 허용된 node·edge·프레임 화면 변경만 계산합니다. */
export function createBoardAutoOrganizeVisualDiff(
  source: DiagramJson,
  candidate: DiagramJson
): BoardAutoOrganizeVisualDiff {
  const candidateNodeById = new Map(candidate.nodes.map((node) => [node.id, node]));
  const sourceFrameById = new Map(
    source.nodes.filter(isBoardAutoPresentationFrameNode).map((node) => [node.id, node])
  );
  const candidateFrameById = new Map(
    candidate.nodes.filter(isBoardAutoPresentationFrameNode).map((node) => [node.id, node])
  );
  const candidateEdgeById = new Map(candidate.edges.map((edge) => [edge.id, edge]));

  return {
    movedNodeIds: source.nodes
      .filter(
        (node) =>
          !isBoardAutoPresentationFrameNode(node) &&
          !samePoint(node.position, candidateNodeById.get(node.id)?.position)
      )
      .map((node) => node.id)
      .sort(),
    resizedNodeIds: source.nodes
      .filter(
        (node) =>
          !isBoardAutoPresentationFrameNode(node) &&
          !sameSize(node.size, candidateNodeById.get(node.id)?.size)
      )
      .map((node) => node.id)
      .sort(),
    reroutedEdgeIds: source.edges
      .filter((edge) => !sameValue(edge.route, candidateEdgeById.get(edge.id)?.route))
      .map((edge) => edge.id)
      .sort(),
    addedFrameIds: [...candidateFrameById.keys()]
      .filter((id) => !sourceFrameById.has(id))
      .sort(),
    changedFrameIds: [...sourceFrameById.keys()]
      .filter(
        (id) =>
          candidateFrameById.has(id) &&
          !sameValue(sourceFrameById.get(id), candidateFrameById.get(id))
      )
      .sort(),
    removedFrameIds: [...sourceFrameById.keys()]
      .filter((id) => !candidateFrameById.has(id))
      .sort()
  };
}

/** 의미 동일성, 유한 geometry, Editor resize 범위와 route 좌표를 모두 확인합니다. */
function isSafeVisualCandidate(
  source: DiagramJson,
  candidate: DiagramJson,
  visualDiff: BoardAutoOrganizeVisualDiff
): boolean {
  if (!hasSameBoardAutoOrganizeSemantics(source, candidate)) {
    return false;
  }

  const changedNodeIds = new Set([
    ...visualDiff.movedNodeIds,
    ...visualDiff.resizedNodeIds,
    ...visualDiff.addedFrameIds,
    ...visualDiff.changedFrameIds
  ]);
  const changedEdgeIds = new Set(visualDiff.reroutedEdgeIds);

  return (
    candidate.nodes
      .filter((node) => changedNodeIds.has(node.id))
      .every(hasValidNodeGeometry) &&
    candidate.edges
      .filter((edge) => changedEdgeIds.has(edge.id))
      .every((edge) => edge.route === undefined || hasValidRouteGeometry(edge.route))
  );
}

/** 변경된 node가 Board 좌표 한계와 Editor resize 범위를 지키는지 확인합니다. */
function hasValidNodeGeometry(node: DiagramNode): boolean {
  const bounds = getNodeResizeBounds(node);

  return (
    isFiniteBoardCoordinate(node.position.x) &&
    isFiniteBoardCoordinate(node.position.y) &&
    Number.isFinite(node.size.width) &&
    Number.isFinite(node.size.height) &&
    node.size.width >= bounds.minWidth &&
    node.size.width <= bounds.maxWidth &&
    node.size.height >= bounds.minHeight &&
    node.size.height <= bounds.maxHeight
  );
}

/** route의 path 문자열과 모든 control point가 유한한지 확인합니다. */
function hasValidRouteGeometry(route: DiagramEdgeRoute): boolean {
  return (
    typeof route.svgPath === "string" &&
    hasFinitePoint(route.sourcePoint) &&
    hasFinitePoint(route.targetPoint) &&
    route.waypoints.every(hasFinitePoint) &&
    (route.labelPosition === undefined || hasFinitePoint(route.labelPosition))
  );
}

/** Board 밖으로 폭주한 값까지 막는 유한 좌표 범위를 확인합니다. */
function isFiniteBoardCoordinate(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= BOARD_COORDINATE_LIMIT;
}

/** route와 node 공통 point가 유한한지 확인합니다. */
function hasFinitePoint(point: { readonly x: number; readonly y: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** 실제로 적용할 수 있는 화면 diff가 하나라도 있는지 확인합니다. */
function hasVisualChanges(diff: BoardAutoOrganizeVisualDiff): boolean {
  return Object.values(diff).some((ids) => ids.length > 0);
}

/** 나빠진 finding 수와 증가량을 원본 기준으로 계산합니다. */
function getRegressionRank(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>
): { readonly count: number; readonly total: number } {
  return REGRESSION_FINDING_KEYS.reduce(
    (rank, key) => {
      const increase = Math.max(0, readFiniteMetric(after[key]) - readFiniteMetric(before[key]));
      return {
        count: rank.count + (increase > 0 ? 1 : 0),
        total: rank.total + increase
      };
    },
    { count: 0, total: 0 }
  );
}

/** 후보 순서는 finding 악화, 품질 점수, visual fingerprint 순으로 고정합니다. */
function compareRankedCandidates(left: RankedCandidate, right: RankedCandidate): number {
  return (
    left.regressionCount - right.regressionCount ||
    left.regressionTotal - right.regressionTotal ||
    left.score - right.score ||
    left.candidate.visualFingerprint.localeCompare(right.candidate.visualFingerprint)
  );
}

/** 누락되거나 유효하지 않은 품질 값은 finding 증가가 없는 값으로 다룹니다. */
function readFiniteMetric(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** 후보의 허용된 geometry와 자동 프레임만 짧은 fingerprint로 만듭니다. */
function createVisualFingerprint(diagram: DiagramJson): string {
  const visualState = {
    nodes: [...diagram.nodes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) =>
        isBoardAutoPresentationFrameNode(node)
          ? node
          : { id: node.id, position: node.position, size: node.size }
      ),
    edges: [...diagram.edges]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((edge) => ({
        id: edge.id,
        route: edge.route,
        sourceHandleId: edge.sourceHandleId,
        targetHandleId: edge.targetHandleId
      }))
  };

  return createFingerprint(stableSerialize(visualState));
}

/** source와 visual 상태 문자열을 브라우저에서도 같은 짧은 fingerprint로 줄입니다. */
function createFingerprint(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** visual fingerprint 객체의 key 순서를 재귀적으로 고정합니다. */
function stableSerialize(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

/** JSON 배열 순서는 보존하고 object key만 결정론적으로 정렬합니다. */
function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObjectKeys(entry)])
  );
}

/** point 값이 없거나 다르면 이동으로 취급합니다. */
function samePoint(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number } | undefined
): boolean {
  return right !== undefined && left.x === right.x && left.y === right.y;
}

/** size 값이 없거나 다르면 크기 변경으로 취급합니다. */
function sameSize(
  left: { readonly width: number; readonly height: number },
  right: { readonly width: number; readonly height: number } | undefined
): boolean {
  return right !== undefined && left.width === right.width && left.height === right.height;
}

/** JSON visual 값의 key 순서 차이를 제외하고 같은지 비교합니다. */
function sameValue(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}
