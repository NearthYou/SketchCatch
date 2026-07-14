import assert from "node:assert/strict";
import test from "node:test";
import {
  isBoardTemplateAvailable,
  listBoardTemplates,
  reviewAvailableBoardTemplate
} from "./template-library";
import { ARCHITECTURE_BOARD_COMPILER_VERSION } from "../architecture-board-compiler";

test("Template review는 source-exact 원본과 Compiler proposal을 별도로 반환한다", () => {
  const template = listBoardTemplates()
    .filter(isBoardTemplateAvailable)
    .find((candidate) => candidate.diagramJson.presentation?.geometryPolicy === "source-exact");

  assert.ok(template);
  if (!template) return;

  const sourceBefore = structuredClone(template.diagramJson);
  const review = reviewAvailableBoardTemplate(template);

  assert.equal(review.templateId, template.id);
  assert.deepEqual(review.sourceDiagram, sourceBefore);
  assert.equal(review.proposal.provenance.compilerVersion, ARCHITECTURE_BOARD_COMPILER_VERSION);
  assert.ok(review.proposal.provenance.candidateId.startsWith("compiled:"));
  assert.ok(review.proposal.changes.length > 0);
  assert.notEqual(review.sourceDiagram, review.proposal.diagram);
  assert.notDeepEqual(review.proposal.diagram, sourceBefore);
  assert.deepEqual(template.diagramJson, sourceBefore);
});
