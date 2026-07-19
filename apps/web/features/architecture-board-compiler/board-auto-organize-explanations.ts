import {
  BOARD_AUTO_ORGANIZE_SAFETY_EXPLANATION,
  type BoardAutoOrganizeVisualDiff,
  type DiagramJson
} from "@sketchcatch/types";
import { isAreaNode } from "../diagram-editor/area-nodes";

export type BoardAutoOrganizeFindingSnapshot = Readonly<Record<string, number>>;

export type BoardAutoOrganizeExplanationInput = {
  readonly sourceDiagram: DiagramJson;
  readonly candidateDiagram: DiagramJson;
  readonly visualDiff: BoardAutoOrganizeVisualDiff;
  readonly findings: {
    readonly before: BoardAutoOrganizeFindingSnapshot;
    readonly after: BoardAutoOrganizeFindingSnapshot;
  };
};

const REGRESSION_FINDINGS: readonly {
  readonly key: string;
  readonly label: string;
}[] = [
  { key: "nodeOverlapCount", label: "Resource 겹침" },
  { key: "parentBoundaryViolationCount", label: "영역 경계 이탈" },
  { key: "edgeNodeIntersectionCount", label: "Resource를 지나는 연결선" },
  { key: "edgeAreaTitleIntersectionCount", label: "영역 제목을 지나는 연결선" },
  { key: "edgeCrossingCount", label: "연결선 교차" },
  { key: "backwardEdgeCount", label: "반대 방향 연결선" },
  { key: "supportLaneIntrusionCount", label: "지원 Resource의 주 흐름 침범" }
];

/** 실제 diff와 finding을 쉬운 문장 세 개 이내로 설명하고 안전 문장을 붙입니다. */
export function createBoardAutoOrganizeExplanations(
  input: BoardAutoOrganizeExplanationInput
): readonly string[] {
  const regressions = createRegressionExplanations(input.findings);
  const concreteChanges = createConcreteChangeExplanations(input);
  const explanations = [...regressions, ...concreteChanges].slice(0, 3);

  return [...explanations, BOARD_AUTO_ORGANIZE_SAFETY_EXPLANATION];
}

/** 원본보다 늘어난 화면 문제를 개선 설명보다 먼저 배치합니다. */
function createRegressionExplanations(
  findings: BoardAutoOrganizeExplanationInput["findings"]
): string[] {
  return REGRESSION_FINDINGS.flatMap(({ key, label }) => {
    const before = readFinding(findings.before, key);
    const after = readFinding(findings.after, key);
    const increase = Math.max(0, after - before);

    return increase > 0
      ? [`${label}가 ${formatPlaceCount(increase)} 늘었습니다. 원본과 비교해 주세요.`]
      : [];
  });
}

/** 이동·크기·연결선·프레임 변경을 화면에서 보이는 이름과 개수로 설명합니다. */
function createConcreteChangeExplanations(
  input: BoardAutoOrganizeExplanationInput
): string[] {
  const { sourceDiagram, candidateDiagram, visualDiff } = input;
  const nodeById = new Map(
    [...sourceDiagram.nodes, ...candidateDiagram.nodes].map((node) => [node.id, node])
  );
  const explanations: string[] = [];
  const firstMovedNode = nodeById.get(visualDiff.movedNodeIds[0] ?? "");
  if (firstMovedNode) {
    explanations.push(
      visualDiff.movedNodeIds.length === 1
        ? `${getVisibleNodeName(firstMovedNode.label)} 위치를 옮겼습니다.`
        : `${getVisibleNodeName(firstMovedNode.label)} 외 ${visualDiff.movedNodeIds.length - 1}개 Resource 위치를 정리했습니다.`
    );
  }

  const firstResizedNode = nodeById.get(visualDiff.resizedNodeIds[0] ?? "");
  if (firstResizedNode) {
    const target = isAreaNode(firstResizedNode) ? "영역 크기" : "크기";
    explanations.push(
      visualDiff.resizedNodeIds.length === 1
        ? `${getVisibleNodeName(firstResizedNode.label)} ${target}를 정리했습니다.`
        : `${getVisibleNodeName(firstResizedNode.label)} 외 ${visualDiff.resizedNodeIds.length - 1}곳의 ${target}를 정리했습니다.`
    );
  }

  if (visualDiff.reroutedEdgeIds.length > 0) {
    explanations.push(`연결선 ${visualDiff.reroutedEdgeIds.length}개의 경로를 정리했습니다.`);
  }

  const frameChangeCount =
    visualDiff.addedFrameIds.length +
    visualDiff.changedFrameIds.length +
    visualDiff.removedFrameIds.length;
  if (frameChangeCount > 0) {
    explanations.push(`표시 프레임 ${frameChangeCount}곳을 정리했습니다.`);
  }

  return explanations;
}

/** 누락되거나 유효하지 않은 내부 finding 값은 사용자 설명에서 0으로 다룹니다. */
function readFinding(findings: BoardAutoOrganizeFindingSnapshot, key: string): number {
  const value = findings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** 사용자 문장에서 1은 곳, 그 밖의 수는 곳 단위로 짧게 표시합니다. */
function formatPlaceCount(count: number): string {
  return `${count}곳`;
}

/** 빈 label 대신 쉬운 일반 이름을 사용해 내부 ID 노출을 막습니다. */
function getVisibleNodeName(label: string): string {
  return label.trim().length > 0 ? label.trim() : "Resource";
}
