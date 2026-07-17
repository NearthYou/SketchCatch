import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureBoardCompilationProposal } from "@sketchcatch/types";

import { createArchitectureBoardCompilationPreview } from ".";

test("Compiler proposal을 자동 정리 미리보기용으로 범주별 요약한다", () => {
  const preview = createArchitectureBoardCompilationPreview(
    proposal({
      changes: [
        change("geometry", "node-a", "위치 변경"),
        change("geometry", "node-b", "크기 변경"),
        change("containment", "node-c", "VPC 소속 변경"),
        change("edge-routing", "edge-a", "관계 경로 변경")
      ],
      diagnostics: [
        diagnostic("warning", "영역 밖 Resource"),
        diagnostic("error", "연결 대상이 없는 관계"),
        diagnostic("warning", "겹침")
      ],
      referenceTemplateIds: ["ecs-fargate-container-app", "three-tier-web-service"]
    })
  );

  assert.deepEqual(preview.changeGroups, [
    { kind: "containment", label: "영역", count: 1 },
    { kind: "geometry", label: "배치", count: 2 },
    { kind: "edge-routing", label: "연결선", count: 1 }
  ]);
  assert.deepEqual(preview.diagnosticGroups, [
    { level: "error", label: "오류", count: 1 },
    { level: "warning", label: "경고", count: 2 }
  ]);
  assert.deepEqual(preview.diagnosticSummaries, [
    "연결 대상이 없는 관계",
    "영역 밖 Resource",
    "겹침"
  ]);
  assert.deepEqual(preview.referenceTemplateIds, [
    "ecs-fargate-container-app",
    "three-tier-web-service"
  ]);
  assert.equal(preview.compilerVersion, "architecture-board-compiler/v1");
  assert.deepEqual(preview.quality, {
    beforeScore: 86,
    afterScore: 31,
    scoreDelta: -55,
    compilationDistance: 7
  });
  assert.deepEqual("outcome" in preview ? preview.outcome : undefined, {
    headline: "배치 문제 5건을 줄였습니다.",
    items: [
      {
        after: 1,
        before: 3,
        key: "nodeOverlapCount",
        label: "Resource 겹침",
        summary: "2건 감소 · 1건 남음",
        tone: "improved"
      },
      {
        after: 0,
        before: 2,
        key: "edgeNodeIntersectionCount",
        label: "Resource를 지나는 연결선",
        summary: "2건 해결",
        tone: "improved"
      },
      {
        after: 0,
        before: 1,
        key: "edgeCrossingCount",
        label: "서로 교차하는 연결선",
        summary: "1건 해결",
        tone: "improved"
      },
      {
        after: 1,
        before: 1,
        key: "parentBoundaryViolationCount",
        label: "영역 경계 밖 Resource",
        summary: "1건 남음",
        tone: "unchanged"
      }
    ],
    remainingDiagnosticCount: 3,
    remainingLayoutIssueCount: 2,
    reviewSummary: "배치 문제 2건과 추가 확인 3건이 남아 있습니다."
  });
});

test("변경과 진단이 없으면 비어 있는 요약을 유지한다", () => {
  const preview = createArchitectureBoardCompilationPreview(proposal({}));

  assert.deepEqual(preview.changeGroups, []);
  assert.deepEqual(preview.diagnosticGroups, []);
  assert.deepEqual(preview.diagnosticSummaries, []);
  assert.deepEqual(preview.referenceTemplateIds, []);
});

test("Compiler metric이 나빠진 경우 개선 표현을 만들지 않고 증가한 수를 그대로 보여준다", () => {
  const preview = createArchitectureBoardCompilationPreview(
    proposal({
      beforeMetrics: {
        nodeOverlapCount: 1,
        edgeNodeIntersectionCount: 0,
        edgeCrossingCount: 0,
        parentBoundaryViolationCount: 0
      },
      afterMetrics: {
        nodeOverlapCount: 3,
        edgeNodeIntersectionCount: 0,
        edgeCrossingCount: 0,
        parentBoundaryViolationCount: 0
      }
    })
  );

  assert.equal(preview.outcome.headline, "배치 문제 2건이 늘었습니다.");
  assert.deepEqual(preview.outcome.items, [
    {
      after: 3,
      before: 1,
      key: "nodeOverlapCount",
      label: "Resource 겹침",
      summary: "2건 증가 · 3건 남음",
      tone: "regressed"
    }
  ]);
});

function proposal({
  afterMetrics,
  beforeMetrics,
  changes = [],
  diagnostics = [],
  referenceTemplateIds = []
}: Partial<Pick<ArchitectureBoardCompilationProposal, "changes" | "diagnostics">> & {
  readonly afterMetrics?: Record<string, number>;
  readonly beforeMetrics?: Record<string, number>;
  readonly referenceTemplateIds?: string[];
}): ArchitectureBoardCompilationProposal {
  return {
    architecture: { nodes: [], edges: [] },
    diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    changes,
    diagnostics,
    quality: {
      before: {
        score: 86,
        visualPenalty: 42,
        structuralPenalty: 44,
        semanticDiagnosticPenalty: 0,
        metrics: {
          nodeOverlapCount: 3,
          edgeNodeIntersectionCount: 2,
          edgeCrossingCount: 1,
          parentBoundaryViolationCount: 1,
          ...beforeMetrics
        }
      },
      after: {
        score: 31,
        visualPenalty: 15,
        structuralPenalty: 16,
        semanticDiagnosticPenalty: 0,
        metrics: {
          nodeOverlapCount: 1,
          edgeNodeIntersectionCount: 0,
          edgeCrossingCount: 0,
          parentBoundaryViolationCount: 1,
          ...afterMetrics
        }
      },
      compilationDistance: 7
    },
    provenance: {
      compilerVersion: "architecture-board-compiler/v1",
      candidateId: "compiled:balanced",
      referenceTemplateIds
    }
  };
}

function change(
  kind: ArchitectureBoardCompilationProposal["changes"][number]["kind"],
  targetId: string,
  summary: string
): ArchitectureBoardCompilationProposal["changes"][number] {
  return {
    id: `${kind}:${targetId}`,
    kind,
    action: "modify",
    targetIds: [targetId],
    before: null,
    after: null,
    summary,
    cost: 1
  };
}

function diagnostic(
  level: ArchitectureBoardCompilationProposal["diagnostics"][number]["level"],
  summary: string
): ArchitectureBoardCompilationProposal["diagnostics"][number] {
  return {
    code: `compiler.${summary}`,
    level,
    summary,
    message: summary,
    relatedChangeIds: [],
    relatedResourceIds: [],
    penalty: 0
  };
}
