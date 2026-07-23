import assert from "node:assert/strict";
import test from "node:test";
import type {
  BoardAutoOrganizeCandidate,
  DiagramEdge,
  DiagramJson,
  DiagramNode
} from "@sketchcatch/types";

import { createReverseEngineeringLayoutSummary } from "./reverse-engineering-layout-summary";

test("실제 전후 배치를 비교해 겹침·연결선·Subnet 이탈만 쉬운 문장으로 설명한다", () => {
  const source = diagram([
    node("subnet", "aws_subnet", "resource", 0, 0, 300, 260),
    child("api", "subnet", 30, 40),
    child("worker", "subnet", 30, 40),
    child("outside", "subnet", 330, 40)
  ]);
  const organized = diagram([
    node("subnet", "aws_subnet", "resource", 0, 0, 300, 260),
    child("api", "subnet", 30, 40),
    child("worker", "subnet", 160, 40),
    child("outside", "subnet", 160, 150)
  ]);

  const summary = createReverseEngineeringLayoutSummary(
    source,
    candidate(organized, ["edge-api-worker"])
  );

  assert.deepEqual(summary, [
    "리소스 겹침 1곳을 정리했습니다.",
    "서브넷 밖 리소스 1개가 정리되었습니다.",
    "연결선 경로 1개가 바뀌었습니다. 결과를 확인해 주세요."
  ]);
  assert.doesNotMatch(summary.join(" "), /점수|candidate|compiler|api|worker|edge-/iu);
});

test("Reverse Engineering의 contains edge를 실제 포함 관계로 계산한다", () => {
  const source = diagram(
    [
      node("subnet", "aws_subnet", "resource", 0, 0, 260, 180),
      node("inside", "aws_instance", "resource", 30, 40, 80, 60),
      node("outside", "aws_instance", "resource", 300, 40, 80, 60)
    ],
    [contains("subnet", "inside"), contains("subnet", "outside")]
  );

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, candidate(source)), [
    "겹친 리소스가 없습니다.",
    "서브넷 밖 리소스 1개를 확인해 주세요."
  ]);
});

test("크기와 표시 영역 변경도 승인 전에 빠짐없이 알린다", () => {
  const source = diagram([node("api", "aws_instance", "resource", 0, 0, 80, 60)]);
  const organized = structuredClone(source);
  const baseCandidate = candidate(organized);
  const organizedCandidate: BoardAutoOrganizeCandidate = {
    ...baseCandidate,
    visualDiff: {
      ...baseCandidate.visualDiff,
      movedNodeIds: ["api"],
      resizedNodeIds: ["api"],
      addedFrameIds: ["region"],
      changedFrameIds: ["vpc"],
      removedFrameIds: ["legacy"]
    }
  };

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, organizedCandidate), [
    "겹친 리소스가 없습니다.",
    "서브넷 밖 리소스가 없습니다.",
    "리소스 위치 1개, 크기 1개, 표시 영역 3개가 바뀌었습니다. 결과를 확인해 주세요."
  ]);
});

test("Compiler가 찾은 악화 항목은 중립적인 변경 요약보다 먼저 보여준다", () => {
  const source = diagram([node("api", "aws_instance", "resource", 0, 0, 80, 60)]);
  const baseCandidate = candidate(structuredClone(source), ["edge-api"]);
  const organizedCandidate: BoardAutoOrganizeCandidate = {
    ...baseCandidate,
    explanations: [
      "연결선 교차가 1곳 늘었습니다. 원본과 비교해 주세요.",
      "Resource, 설정, 연결 관계는 바뀌지 않았습니다."
    ]
  };

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, organizedCandidate), [
    "연결선 교차가 1곳 늘었습니다. 원본과 비교해 주세요.",
    "겹친 리소스가 없습니다.",
    "서브넷 밖 리소스가 없습니다.",
    "연결선 경로 1개가 바뀌었습니다. 결과를 확인해 주세요."
  ]);
});

test("아이콘이 떨어져 있어도 실제 Board 라벨 영역이 겹치면 겹침으로 센다", () => {
  const source = diagram([
    node("left", "aws_instance", "resource", 0, 0, 48, 48),
    node("right", "aws_instance", "resource", 80, 0, 48, 48)
  ]);

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, candidate(source)), [
    "겹친 리소스 1곳을 확인해 주세요.",
    "서브넷 밖 리소스가 없습니다."
  ]);
});

test("아이콘은 안쪽이어도 라벨 영역이 Subnet 밖이면 확인 대상으로 센다", () => {
  const source = diagram(
    [
      node("subnet", "aws_subnet", "resource", 0, 0, 180, 160),
      node("api", "aws_instance", "resource", 120, 40, 48, 48)
    ],
    [contains("subnet", "api")]
  );

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, candidate(source)), [
    "겹친 리소스가 없습니다.",
    "서브넷 밖 리소스 1개를 확인해 주세요."
  ]);
});

test("Resource를 옮기지 않고 Subnet을 넓힌 경우 옮겼다고 말하지 않는다", () => {
  const source = diagram(
    [
      node("subnet", "aws_subnet", "resource", 0, 0, 160, 160),
      node("api", "aws_instance", "resource", 100, 40, 48, 48)
    ],
    [contains("subnet", "api")]
  );
  const organized = structuredClone(source);
  organized.nodes[0] = { ...organized.nodes[0]!, size: { width: 200, height: 160 } };
  const baseCandidate = candidate(organized);
  const organizedCandidate: BoardAutoOrganizeCandidate = {
    ...baseCandidate,
    visualDiff: { ...baseCandidate.visualDiff, resizedNodeIds: ["subnet"] }
  };

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, organizedCandidate), [
    "겹친 리소스가 없습니다.",
    "서브넷 밖 리소스 1개가 정리되었습니다.",
    "크기 1개가 바뀌었습니다. 결과를 확인해 주세요."
  ]);
});

test("Resource 크기만 줄어 경계 안에 들어와도 Subnet을 바꿨다고 추측하지 않는다", () => {
  const source = diagram(
    [
      node("subnet", "aws_subnet", "resource", 0, 0, 180, 180),
      node("api", "aws_instance", "resource", 100, 40, 80, 80)
    ],
    [contains("subnet", "api")]
  );
  const organized = structuredClone(source);
  organized.nodes[1] = { ...organized.nodes[1]!, size: { width: 48, height: 48 } };
  const baseCandidate = candidate(organized);
  const organizedCandidate: BoardAutoOrganizeCandidate = {
    ...baseCandidate,
    visualDiff: { ...baseCandidate.visualDiff, resizedNodeIds: ["api"] }
  };

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, organizedCandidate), [
    "겹친 리소스가 없습니다.",
    "서브넷 밖 리소스 1개가 정리되었습니다.",
    "크기 1개가 바뀌었습니다. 결과를 확인해 주세요."
  ]);
});

test("밖에 있던 Resource와 새로 벗어난 Resource를 ID 기준으로 따로 설명한다", () => {
  const source = diagram(
    [
      node("subnet", "aws_subnet", "resource", 0, 0, 300, 220),
      node("old-outside-a", "aws_instance", "resource", 330, 20, 48, 48),
      node("old-outside-b", "aws_instance", "resource", 330, 120, 48, 48),
      node("new-outside", "aws_instance", "resource", 80, 20, 48, 48)
    ],
    [
      contains("subnet", "old-outside-a"),
      contains("subnet", "old-outside-b"),
      contains("subnet", "new-outside")
    ]
  );
  const organized = structuredClone(source);
  organized.nodes[1] = { ...organized.nodes[1]!, position: { x: 40, y: 20 } };
  organized.nodes[2] = { ...organized.nodes[2]!, position: { x: 160, y: 120 } };
  organized.nodes[3] = { ...organized.nodes[3]!, position: { x: 330, y: 20 } };

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, candidate(organized)), [
    "겹친 리소스가 없습니다.",
    "서브넷 밖 리소스 2개가 정리됐지만, 1개가 새로 경계를 벗어났습니다. 총 1개를 확인해 주세요."
  ]);
});

test("정리 뒤에도 문제가 남으면 해결했다고 거짓말하지 않고 확인을 요청한다", () => {
  const source = diagram([
    node("subnet", "SUBNET", "resource", 0, 0, 240, 180),
    child("api", "subnet", 20, 20),
    child("worker", "subnet", 20, 20),
    child("outside", "subnet", 260, 20)
  ]);
  const organized = structuredClone(source);

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, candidate(organized)), [
    "겹친 리소스 1곳을 확인해 주세요.",
    "서브넷 밖 리소스 1개를 확인해 주세요."
  ]);
});

test("Design 표시 영역과 부모-자식 포함 관계는 리소스 겹침으로 세지 않는다", () => {
  const source = diagram([
    node("region", "design_group", "design", 0, 0, 500, 400),
    node("subnet", "aws_subnet", "resource", 20, 20, 300, 220),
    child("api", "subnet", 50, 50)
  ]);

  assert.deepEqual(createReverseEngineeringLayoutSummary(source, candidate(source)), [
    "겹친 리소스가 없습니다.",
    "서브넷 밖 리소스가 없습니다."
  ]);
});

function candidate(
  diagramJson: DiagramJson,
  reroutedEdgeIds: readonly string[] = []
): BoardAutoOrganizeCandidate {
  return {
    id: "candidate-internal-id",
    diagram: diagramJson,
    visualDiff: {
      movedNodeIds: [],
      resizedNodeIds: [],
      reroutedEdgeIds,
      addedFrameIds: [],
      changedFrameIds: [],
      removedFrameIds: []
    },
    explanations: [],
    visualFingerprint: "internal-fingerprint"
  };
}

function diagram(nodes: DiagramNode[], edges: DiagramEdge[] = []): DiagramJson {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } };
}

function contains(sourceNodeId: string, targetNodeId: string): DiagramEdge {
  return {
    id: `${sourceNodeId}-contains-${targetNodeId}`,
    sourceNodeId,
    targetNodeId,
    label: "contains"
  };
}

function child(id: string, parentAreaNodeId: string, x: number, y: number): DiagramNode {
  return {
    ...node(id, "aws_instance", "resource", x, y, 80, 60),
    metadata: { parentAreaNodeId }
  };
}

function node(
  id: string,
  type: string,
  kind: DiagramNode["kind"],
  x: number,
  y: number,
  width: number,
  height: number
): DiagramNode {
  return {
    id,
    type,
    kind,
    position: { x, y },
    size: { width, height },
    label: id,
    locked: false,
    zIndex: kind === "design" ? 0 : 1
  };
}
