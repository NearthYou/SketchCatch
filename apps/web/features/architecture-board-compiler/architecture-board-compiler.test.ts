import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureJson, DiagramJson } from "@sketchcatch/types";
import {
  ARCHITECTURE_BOARD_COMPILER_VERSION,
  architectureBoardKnowledge,
  compileArchitectureBoard,
  createArchitectureBoardKnowledgeArtifact,
  evaluateArchitectureBoardKnowledgeLeaveOneOut
} from ".";

const architecture: ArchitectureJson = {
  nodes: [
    { id: "api", type: "API_GATEWAY_REST_API", label: "API", positionX: 0, positionY: 0, config: {} },
    { id: "function", type: "LAMBDA", label: "Function", positionX: 0, positionY: 0, config: {} }
  ],
  edges: [{ id: "api-function", sourceId: "api", targetId: "function", label: "invokes" }]
};

test("knowledge artifact는 30개 gallery 중 29개 사례와 실패 evidence 하나를 고정한다", () => {
  assert.equal(architectureBoardKnowledge.cases.length, 29);
  assert.equal(architectureBoardKnowledge.unavailableTemplateIds.length, 1);
  assert.equal(
    createArchitectureBoardKnowledgeArtifact().hash,
    createArchitectureBoardKnowledgeArtifact().hash
  );
});

test("29개 사례 leave-one-out report는 매 사례를 나머지 28개와 비교한다", () => {
  const report = evaluateArchitectureBoardKnowledgeLeaveOneOut();

  assert.equal(report.length, 29);
  assert.ok(report.every((result) => result.heldOutCaseId !== result.nearestCaseId));
  assert.ok(
    report.every((result) =>
      [result.resourceTypeRecall, result.aspectRatioError, result.siblingGapError].every(Number.isFinite)
    )
  );
});

test("Compiler는 같은 입력과 version에 완전히 같은 proposal을 반환하고 입력을 바꾸지 않는다", () => {
  const input = { architecture, trigger: "ai-draft" as const };
  const before = structuredClone(input);
  const first = compileArchitectureBoard(input);
  const second = compileArchitectureBoard(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(first.provenance.compilerVersion, ARCHITECTURE_BOARD_COMPILER_VERSION);
  assert.equal(first.provenance.referenceTemplateIds.length, 3);
  assert.equal(first.diagram.nodes.length, architecture.nodes.length);
});

test("Compiler는 original 후보를 선택할 수 있고 빈 Board로 Resource를 지우지 않는다", () => {
  const currentDiagram = compileArchitectureBoard({ architecture, trigger: "ai-draft" }).diagram;
  const proposal = compileArchitectureBoard({
    architecture,
    currentDiagram,
    trigger: "board-auto-organize"
  });

  assert.ok(proposal.provenance.candidateId === "original" || proposal.provenance.candidateId.startsWith("compiled:"));
  assert.equal(proposal.diagram.nodes.length, 2);
});

test("Compiler는 잘못된 관계를 숨기지 않고 diagnostic으로 반환한다", () => {
  const proposal = compileArchitectureBoard({
    architecture: {
      nodes: architecture.nodes,
      edges: [{ id: "dangling", sourceId: "api", targetId: "missing" }]
    },
    trigger: "reverse-engineering"
  });

  assert.ok(proposal.diagnostics.some(({ code }) => code === "compiler.dangling_relationship"));
});

test("Compiler changes는 승인 전 proposal일 뿐 현재 Diagram을 mutation하지 않는다", () => {
  const currentDiagram: DiagramJson = {
    nodes: [],
    edges: [],
    viewport: { x: 7, y: 9, zoom: 0.75 }
  };
  const before = structuredClone(currentDiagram);
  const proposal = compileArchitectureBoard({ architecture, currentDiagram, trigger: "ai-draft" });

  assert.deepEqual(currentDiagram, before);
  assert.ok(proposal.changes.some(({ category, operation }) => category === "resource" && operation === "add"));
  assert.ok(proposal.quality.compilationDistance > 0);
});
