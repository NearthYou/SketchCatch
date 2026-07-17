import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureBoardCompilationProposal } from "@sketchcatch/types";
import {
  createReverseEngineeringCompilationReview,
  formatCompilationScore
} from "./reverse-engineering-compilation-review";

const proposal = {
  architecture: { nodes: [], edges: [] },
  diagram: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
  changes: [
    {
      id: "change-1",
      kind: "geometry",
      action: "modify",
      targetIds: ["resource-1"],
      before: null,
      after: null,
      summary: "위치 변경",
      cost: 1
    }
  ],
  diagnostics: [
    { code: "first", level: "warning", summary: "first", message: "첫 번째", relatedChangeIds: [], relatedResourceIds: [], penalty: 1 },
    { code: "second", level: "info", summary: "second", message: "두 번째", relatedChangeIds: [], relatedResourceIds: [], penalty: 0 },
    { code: "third", level: "error", summary: "third", message: "세 번째", relatedChangeIds: [], relatedResourceIds: [], penalty: 2 },
    { code: "fourth", level: "warning", summary: "fourth", message: "네 번째", relatedChangeIds: [], relatedResourceIds: [], penalty: 1 }
  ],
  quality: {
    before: { score: 12, visualPenalty: 4, structuralPenalty: 8, semanticDiagnosticPenalty: 0, metrics: {} },
    after: { score: 4.5, visualPenalty: 2, structuralPenalty: 2.5, semanticDiagnosticPenalty: 0, metrics: {} },
    compilationDistance: 7
  },
  provenance: {
    compilerVersion: "architecture-board-compiler/v1",
    candidateId: "compiled",
    referenceTemplateIds: ["template-a", "template-b"]
  }
} satisfies ArchitectureBoardCompilationProposal;

test("Reverse Engineering 검토는 제안의 핵심 정보와 최대 세 개 진단만 노출한다", () => {
  const review = createReverseEngineeringCompilationReview(proposal);

  assert.equal(review.changeCount, 1);
  assert.deepEqual(review.diagnostics.map((diagnostic) => diagnostic.message), ["첫 번째", "두 번째", "세 번째"]);
  assert.equal(review.hiddenDiagnosticCount, 1);
  assert.deepEqual(review.referenceTemplateIds, ["template-a", "template-b"]);
  assert.equal(review.quality.compilationDistance, 7);
});

test("컴파일 점수는 불필요한 소수점 없이 읽기 좋게 표시한다", () => {
  assert.equal(formatCompilationScore(12), "12");
  assert.equal(formatCompilationScore(4.56), "4.6");
});

test("일반 Compiler 진단은 원본 식별자를 숨긴 화면용 안내로 투영한다", () => {
  const rawDiagnostic = {
    code: "compiler.invalid_containment_parent",
    level: "warning" as const,
    summary: "존재하지 않는 containment parent",
    message: "Resource resource-vpc-0123456789abcdef0의 parent resource-i-0123456789abcdef0를 찾지 못했습니다.",
    relatedChangeIds: ["configuration:resource-vpc-0123456789abcdef0"],
    relatedResourceIds: ["resource-vpc-0123456789abcdef0", "resource-i-0123456789abcdef0"],
    penalty: 1_000
  };
  const review = createReverseEngineeringCompilationReview({
    ...proposal,
    diagnostics: [rawDiagnostic]
  });

  assert.deepEqual(review.diagnostics, [
    {
      code: "compiler.invalid_containment_parent",
      level: "warning",
      summary: "Resource 배치 관계 확인 필요",
      message: "Resource의 상위 배치 대상을 확인해 주세요."
    }
  ]);
  assert.equal(rawDiagnostic.message.includes("resource-vpc-0123456789abcdef0"), true);
  assert.equal(rawDiagnostic.relatedResourceIds[0], "resource-vpc-0123456789abcdef0");
});
