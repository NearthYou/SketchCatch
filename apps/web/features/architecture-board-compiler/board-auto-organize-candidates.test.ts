import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramJson, DiagramNode } from "@sketchcatch/types";
import { hasSameBoardAutoOrganizeSemantics } from "@sketchcatch/types";

import { createBoardAutoOrganizeCandidates } from "./board-auto-organize-candidates";

test("후보 gallery는 서로 다른 visual-only Diagram을 최대 세 개 반환한다", () => {
  const crowdedDiagram = diagram();
  const result = createBoardAutoOrganizeCandidates(crowdedDiagram);

  assert(result.candidates.length > 0);
  assert(result.candidates.length <= 3);
  assert.equal(
    new Set(result.candidates.map((item) => item.visualFingerprint)).size,
    result.candidates.length
  );
  for (const candidate of result.candidates) {
    assert.equal(hasSameBoardAutoOrganizeSemantics(crowdedDiagram, candidate.diagram), true);
    assert.equal(candidate.explanations.at(-1), "Resource, 설정, 연결 관계는 바뀌지 않았습니다.");
    assert(candidate.explanations.length <= 4);
  }
});

test("같은 Board는 같은 순서와 fingerprint를 가진 후보를 만든다", () => {
  const source = diagram();

  const first = createBoardAutoOrganizeCandidates(source);
  const second = createBoardAutoOrganizeCandidates(structuredClone(source));

  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.equal(first.sessionId, second.sessionId);
  assert.deepEqual(
    first.candidates.map(({ id, visualFingerprint }) => ({ id, visualFingerprint })),
    second.candidates.map(({ id, visualFingerprint }) => ({ id, visualFingerprint }))
  );
});

test("잠긴 자동 프레임과 사용자 Design Group은 모든 후보에서 보존된다", () => {
  const source = diagram();
  const lockedFrame = autoFrame("board-auto-frame:locked", true);
  const userGroup = {
    ...autoFrame("board-auto-frame:user-owned", false),
    metadata: { presentationCatalogItemId: "design-region" },
    label: "사용자 그룹"
  };
  source.nodes.push(lockedFrame, userGroup);

  const result = createBoardAutoOrganizeCandidates(source);

  for (const candidate of result.candidates) {
    assert.deepEqual(
      candidate.diagram.nodes.find((node) => node.id === lockedFrame.id),
      lockedFrame
    );
    assert.equal(
      candidate.diagram.nodes.some((node) => node.id === userGroup.id),
      true
    );
  }
});

/** 여러 전략이 실제로 다른 배치를 만들 수 있는 혼잡한 Board를 만듭니다. */
function diagram(): DiagramJson {
  const nodes: DiagramNode[] = [
    resourceNode("client", "sketchcatch_user_client", "사용자", 20, 20),
    resourceNode("gateway", "aws_api_gateway_rest_api", "API Gateway", 30, 30),
    resourceNode("lambda", "aws_lambda_function", "Lambda", 40, 40),
    resourceNode("queue", "aws_sqs_queue", "작업 대기열", 50, 50),
    resourceNode("bucket", "aws_s3_bucket", "결과 저장소", 60, 60),
    resourceNode("alarm", "aws_cloudwatch_metric_alarm", "장애 알림", 70, 70)
  ];

  return {
    nodes,
    edges: [
      edge("client-gateway", "client", "gateway"),
      edge("gateway-lambda", "gateway", "lambda"),
      edge("lambda-queue", "lambda", "queue"),
      edge("queue-bucket", "queue", "bucket"),
      edge("alarm-lambda", "alarm", "lambda", "monitors")
    ],
    viewport: { x: 13, y: 21, zoom: 0.8 }
  };
}

/** 자동 정리용 Resource fixture를 짧게 만듭니다. */
function resourceNode(
  id: string,
  resourceType: string,
  label: string,
  x: number,
  y: number
): DiagramNode {
  return {
    id,
    type: resourceType,
    kind: "resource",
    position: { x, y },
    size: { width: 48, height: 48 },
    label,
    locked: false,
    zIndex: 2,
    parameters: {
      resourceType,
      resourceName: id,
      fileName: "main.tf",
      values: {}
    }
  };
}

/** 방향 의미를 가진 Resource 관계 fixture를 만듭니다. */
function edge(id: string, sourceNodeId: string, targetNodeId: string, label = "request") {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    label,
    route: {
      svgPath: "M 0 0 L 10 10",
      sourcePoint: { x: 0, y: 0 },
      targetPoint: { x: 10, y: 10 },
      waypoints: [],
      arrowDirection: "source-to-target" as const
    }
  };
}

/** 보존 확인에 쓰는 full-tuple 자동 프레임을 만듭니다. */
function autoFrame(id: string, locked: boolean): DiagramNode {
  return {
    id,
    type: "design_group",
    kind: "design",
    position: { x: -20, y: -20 },
    size: { width: 240, height: 180 },
    label: "자동 표시 영역",
    locked,
    zIndex: 0,
    metadata: { presentationCatalogItemId: "design-group" }
  };
}
