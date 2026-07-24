import assert from "node:assert/strict";
import test from "node:test";
import {
  isBoardTemplateAvailable,
  listBoardTemplates,
  listLegacyBoardTemplates,
  resolveApprovedBoardTemplateDiagram,
  reviewAvailableBoardTemplate
} from "./template-library";
import {
  approveTemplateReview,
  ARCHITECTURE_BOARD_COMPILER_VERSION,
  createTemplateReviewSession
} from "../architecture-board-compiler";

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

test("승인된 visual-only Template review variant만 gallery/start diagram resolver가 소비한다", () => {
  const candidate = listBoardTemplates()
    .filter(isBoardTemplateAvailable)
    .map((template) => ({
      template,
      session: createTemplateReviewSession({
        templateId: template.id,
        sourceDiagram: template.diagramJson
      })
    }))
    .find(({ session }) => session.status === "ready");

  assert.ok(candidate);
  if (!candidate) return;

  const sourceBefore = structuredClone(candidate.template.diagramJson);
  const approval = approveTemplateReview(candidate.session, {
    reviewedAt: "2026-07-15T00:00:00.000Z"
  });
  const resolved = resolveApprovedBoardTemplateDiagram(
    candidate.template.id,
    candidate.template.diagramJson,
    approval
  );

  assert.deepEqual(resolved, candidate.session.proposal.diagram);
  assert.deepEqual(candidate.template.diagramJson, sourceBefore);
});

test("AWS onboarding template does not expose the Training prefix", () => {
  const template = listBoardTemplates().find(
    (candidate) => candidate.id === "brainboard-training-aws-onboarding"
  );

  assert.ok(template);
  if (!template) return;

  assert.equal(template.title, "AWS onboarding");
});

test("Live Observation legacy fixture is not exposed in the dashboard catalog", () => {
  const templates = listBoardTemplates();

  assert.equal(
    templates.some((template) => template.id === "template-live-observation"),
    false
  );
});

test("Live Observation scaling policy omits the unbounded cooldown", () => {
  const template = listLegacyBoardTemplates()
    .filter(isBoardTemplateAvailable)
    .find((candidate) => candidate.id === "template-live-observation");
  const policy = template?.diagramJson.nodes.find(
    (node) => node.id === "template-live-policy"
  );

  assert.ok(policy?.parameters);
  assert.equal(policy?.parameters?.values.cooldown, undefined);
  assert.equal(policy?.parameters?.values.estimatedInstanceWarmup, 60);
});

test("Live Observation log group uses a unique prefix for each project deployment", () => {
  const template = listLegacyBoardTemplates()
    .filter(isBoardTemplateAvailable)
    .find((candidate) => candidate.id === "template-live-observation");
  const logGroup = template?.diagramJson.nodes.find(
    (node) => node.id === "template-live-log-group"
  );

  assert.ok(logGroup?.parameters);
  assert.equal(logGroup?.parameters?.values.name, undefined);
  assert.equal(
    logGroup?.parameters?.values.namePrefix,
    "/sketchcatch/demo/sc-lo/traffic-"
  );
});
