import assert from "node:assert/strict";
import test from "node:test";
import type { BoardAutoOrganizeCandidate, DiagramJson, DiagramNode } from "@sketchcatch/types";

import { createReverseEngineeringLayoutSummary } from "./reverse-engineering-layout-summary";

test("실제 전후 배치를 비교해 겹침·연결선·Subnet 이탈만 쉬운 문장으로 설명한다", () => {
  const source = diagram([
    node("subnet", "aws_subnet", "resource", 0, 0, 300, 220),
    child("api", "subnet", 30, 40),
    child("worker", "subnet", 30, 40),
    child("outside", "subnet", 330, 40)
  ]);
  const organized = diagram([
    node("subnet", "aws_subnet", "resource", 0, 0, 300, 220),
    child("api", "subnet", 30, 40),
    child("worker", "subnet", 130, 40),
    child("outside", "subnet", 130, 130)
  ]);

  const summary = createReverseEngineeringLayoutSummary(
    source,
    candidate(organized, ["edge-api-worker"])
  );

  assert.deepEqual(summary, [
    "리소스 겹침 1곳을 정리했습니다.",
    "연결선 1개를 보기 쉽게 정리했습니다.",
    "서브넷 밖 리소스 1개를 안으로 옮겼습니다."
  ]);
  assert.doesNotMatch(summary.join(" "), /점수|candidate|compiler|api|worker|edge-/iu);
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

function diagram(nodes: DiagramNode[]): DiagramJson {
  return { nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
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
