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
