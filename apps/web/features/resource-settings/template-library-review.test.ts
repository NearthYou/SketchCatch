import assert from "node:assert/strict";
import test from "node:test";
import {
  isBoardTemplateAvailable,
  listBoardTemplates,
  reviewAvailableBoardTemplate
} from "./template-library";

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
  assert.deepEqual(review.proposal.diagram.nodes, sourceBefore.nodes);
  assert.deepEqual(review.proposal.diagram.edges, sourceBefore.edges);
  assert.deepEqual(review.proposal.diagram.viewport, sourceBefore.viewport);
  assert.deepEqual(review.proposal.diagram.presentation, sourceBefore.presentation);
  assert.equal(review.proposal.provenance.compilerVersion, "architecture-board-compiler/v1");
  assert.notEqual(review.sourceDiagram, review.proposal.diagram);
  assert.deepEqual(template.diagramJson, sourceBefore);
});
