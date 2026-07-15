import assert from "node:assert/strict";
import test from "node:test";
import type { ArchitectureBoardCompilationProposal, DiagramJson } from "@sketchcatch/types";
import {
  approveTemplateReview,
  createTemplateReviewSession,
  rejectTemplateReview,
  resolveApprovedTemplateReviewVariant
} from "./template-review-workflow";

const sourceDiagram: DiagramJson = {
  nodes: [
    {
      id: "entry",
      type: "aws_lb",
      kind: "resource",
      label: "Entry",
      locked: false,
      parameters: {
        fileName: "main.tf",
        resourceName: "entry",
        resourceType: "aws_lb",
        terraformBlockType: "resource",
        values: {}
      },
      position: { x: 900, y: 400 },
      size: { width: 168, height: 96 },
      zIndex: 1
    },
    {
      id: "service",
      type: "aws_instance",
      kind: "resource",
      label: "Service",
      locked: false,
      parameters: {
        fileName: "main.tf",
        resourceName: "service",
        resourceType: "aws_instance",
        terraformBlockType: "resource",
        values: {}
      },
      position: { x: 40, y: 80 },
      size: { width: 168, height: 96 },
      zIndex: 1
    }
  ],
  edges: [{ id: "entry-service", sourceNodeId: "entry", targetNodeId: "service" }],
  viewport: { x: 0, y: 0, zoom: 1 }
};

test("Template review 승인본은 source fingerprint가 일치하는 경우에만 안전한 compiled variant를 반환한다", () => {
  const sourceBefore = structuredClone(sourceDiagram);
  const session = createTemplateReviewSession({
    templateId: "reviewed-template",
    sourceDiagram
  });

  assert.equal(session.status, "ready");
  const approval = approveTemplateReview(session, { reviewedAt: "2026-07-15T00:00:00.000Z" });
  const resolved = resolveApprovedTemplateReviewVariant(
    { id: "reviewed-template", diagramJson: sourceDiagram },
    approval
  );

  assert.equal(approval.status, "approved");
  assert.equal(resolved.applied, true);
  assert.deepEqual(resolved.diagram, session.proposal.diagram);
  assert.deepEqual(sourceDiagram, sourceBefore);
});

test("Template review 승인본은 source가 바뀌면 오래된 compiled variant를 적용하지 않는다", () => {
  const session = createTemplateReviewSession({
    templateId: "reviewed-template",
    sourceDiagram
  });
  const approval = approveTemplateReview(session, { reviewedAt: "2026-07-15T00:00:00.000Z" });
  const changedSource: DiagramJson = {
    ...structuredClone(sourceDiagram),
    nodes: sourceDiagram.nodes.map((node) =>
      node.id === "service" ? { ...node, label: "Changed service" } : node
    )
  };
  const resolved = resolveApprovedTemplateReviewVariant(
    { id: "reviewed-template", diagramJson: changedSource },
    approval
  );

  assert.equal(resolved.applied, false);
  assert.equal(resolved.reason, "source-changed");
  assert.deepEqual(resolved.diagram, changedSource);
});

test("Resource·관계·설정 변경 proposal은 Template gallery overlay로 승인할 수 없다", () => {
  const safeSession = createTemplateReviewSession({
    templateId: "unsafe-template",
    sourceDiagram
  });
  const unsafeProposal: ArchitectureBoardCompilationProposal = {
    ...safeSession.proposal,
    changes: [
      ...safeSession.proposal.changes,
      {
        id: "resource:add:database",
        kind: "resource",
        action: "add",
        targetIds: ["database"],
        summary: "Database 추가",
        cost: 800,
        before: null,
        after: { id: "database" }
      }
    ]
  };
  const session = createTemplateReviewSession({
    templateId: "unsafe-template",
    sourceDiagram,
    proposal: unsafeProposal
  });

  assert.equal(session.status, "hold");
  assert.throws(
    () => approveTemplateReview(session, { reviewedAt: "2026-07-15T00:00:00.000Z" }),
    /semantic change/i
  );
});

test("거절된 Template review는 source를 그대로 반환한다", () => {
  const session = createTemplateReviewSession({
    templateId: "rejected-template",
    sourceDiagram
  });
  const rejection = rejectTemplateReview(session, {
    reason: "시각 검토에서 보류",
    reviewedAt: "2026-07-15T00:00:00.000Z"
  });
  const resolved = resolveApprovedTemplateReviewVariant(
    { id: "rejected-template", diagramJson: sourceDiagram },
    rejection
  );

  assert.equal(rejection.status, "rejected");
  assert.equal(resolved.applied, false);
  assert.equal(resolved.reason, "not-approved");
  assert.deepEqual(resolved.diagram, sourceDiagram);
});
