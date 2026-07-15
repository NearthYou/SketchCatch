import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureBoardCompilationProposal } from "@sketchcatch/types";

import { createArchitectureBoardCompilationPreview } from ".";

test("Compiler proposal을 자동 정리 미리보기용으로 범주별 요약한다", () => {
  const preview = createArchitectureBoardCompilationPreview(proposal({
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
  }));

  assert.deepEqual(preview.changeGroups, [
    { kind: "containment", label: "영역", count: 1 },
    { kind: "geometry", label: "배치", count: 2 },
    { kind: "edge-routing", label: "연결선", count: 1 }
  ]);
  assert.deepEqual(preview.diagnosticGroups, [
    { level: "error", label: "오류", count: 1 },
    { level: "warning", label: "경고", count: 2 }
  ]);
  assert.deepEqual(preview.diagnosticSummaries, ["연결 대상이 없는 관계", "영역 밖 Resource", "겹침"]);
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
});

test("변경과 진단이 없으면 비어 있는 요약을 유지한다", () => {
  const preview = createArchitectureBoardCompilationPreview(proposal({}));

  assert.deepEqual(preview.changeGroups, []);
  assert.deepEqual(preview.diagnosticGroups, []);
  assert.deepEqual(preview.diagnosticSummaries, []);
  assert.deepEqual(preview.referenceTemplateIds, []);
});

function proposal({
  changes = [],
  diagnostics = [],
  referenceTemplateIds = []
}: Partial<Pick<ArchitectureBoardCompilationProposal, "changes" | "diagnostics">> & {
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
        metrics: {}
      },
      after: {
        score: 31,
        visualPenalty: 15,
        structuralPenalty: 16,
        semanticDiagnosticPenalty: 0,
        metrics: {}
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
