import assert from "node:assert/strict";
import test from "node:test";
import type { BoardAutoOrganizeVisualDiff, DiagramJson } from "@sketchcatch/types";

import { createBoardAutoOrganizeExplanations } from "./board-auto-organize-explanations";

test("설명은 나빠진 finding을 먼저 알리고 안전 문장으로 끝난다", () => {
  const source = diagram();
  const candidate = structuredClone(source);
  candidate.nodes[0]!.position = { x: 320, y: 120 };
  const visualDiff = diff({ movedNodeIds: ["api"] });

  const explanations = createBoardAutoOrganizeExplanations({
    sourceDiagram: source,
    candidateDiagram: candidate,
    visualDiff,
    findings: {
      before: { edgeCrossingCount: 0, nodeOverlapCount: 1 },
      after: { edgeCrossingCount: 1, nodeOverlapCount: 0 }
    }
  });

  assert.equal(explanations[0], "연결선 교차가 1곳 늘었습니다. 원본과 비교해 주세요.");
  assert(explanations.some((message) => message.includes("API Server")));
  assert.equal(explanations.at(-1), "Resource, 설정, 연결 관계는 바뀌지 않았습니다.");
  assert(explanations.length <= 4);
  assert.equal(explanations.some((message) => /candidate|compiler|template/iu.test(message)), false);
});

test("설명은 실제 변경을 세 개까지만 말하고 내부 ID를 노출하지 않는다", () => {
  const source = diagram();
  const candidate = structuredClone(source);
  candidate.nodes[0]!.position = { x: 320, y: 120 };
  candidate.nodes[1]!.size = { width: 96, height: 72 };
  const explanations = createBoardAutoOrganizeExplanations({
    sourceDiagram: source,
    candidateDiagram: candidate,
    visualDiff: diff({
      movedNodeIds: ["api"],
      resizedNodeIds: ["bucket"],
      reroutedEdgeIds: ["internal-edge-id"],
      addedFrameIds: ["board-auto-frame:internal"]
    }),
    findings: { before: {}, after: {} }
  });

  assert(explanations.length <= 4);
  assert.equal(explanations.some((message) => message.includes("internal-edge-id")), false);
  assert.equal(explanations.some((message) => message.includes("board-auto-frame:")), false);
  assert.equal(explanations.at(-1), "Resource, 설정, 연결 관계는 바뀌지 않았습니다.");
});

test("설명은 같은 단계 영역 겹침 finding도 숨기지 않는다", () => {
  const source = diagram();
  const candidate = structuredClone(source);
  candidate.nodes[0]!.position = { x: 320, y: 120 };

  const explanations = createBoardAutoOrganizeExplanations({
    sourceDiagram: source,
    candidateDiagram: candidate,
    visualDiff: diff({ movedNodeIds: ["api"] }),
    findings: {
      before: { siblingAreaOverlapCount: 0 },
      after: { siblingAreaOverlapCount: 2 }
    }
  });

  assert.equal(
    explanations[0],
    "같은 단계 영역 겹침이 2곳 늘었습니다. 원본과 비교해 주세요."
  );
});

/** 설명 테스트가 필요한 visual diff 기본값을 채웁니다. */
function diff(
  overrides: Partial<BoardAutoOrganizeVisualDiff>
): BoardAutoOrganizeVisualDiff {
  return {
    movedNodeIds: [],
    resizedNodeIds: [],
    reroutedEdgeIds: [],
    addedFrameIds: [],
    changedFrameIds: [],
    removedFrameIds: [],
    ...overrides
  };
}

/** 사용자에게 보이는 이름을 가진 최소 설명 Diagram을 만듭니다. */
function diagram(): DiagramJson {
  return {
    nodes: [
      {
        id: "api",
        type: "aws_instance",
        kind: "resource",
        position: { x: 40, y: 40 },
        size: { width: 48, height: 48 },
        label: "API Server",
        locked: false,
        zIndex: 2
      },
      {
        id: "bucket",
        type: "aws_s3_bucket",
        kind: "resource",
        position: { x: 240, y: 40 },
        size: { width: 48, height: 48 },
        label: "결과 저장소",
        locked: false,
        zIndex: 2
      }
    ],
    edges: [{ id: "internal-edge-id", sourceNodeId: "api", targetNodeId: "bucket" }],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
}
