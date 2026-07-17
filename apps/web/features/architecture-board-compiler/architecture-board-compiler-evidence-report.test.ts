import assert from "node:assert/strict";
import test from "node:test";
import { buildTemplateDiagramJson } from "@sketchcatch/types";
import {
  createArchitectureBoardCompilerEvidenceReport,
  renderArchitectureBoardCompilerEvidenceReport
} from "./architecture-board-compiler-evidence-report";
import { createArchitectureBoardCompilerEvidenceRegressionBudget } from "./architecture-board-compiler-evidence-baseline";
import { collectArchitectureBoardCompilerEvidenceInput } from "./architecture-board-compiler-evidence-source";

test("Compiler evidence report는 source fixture를 바꾸지 않고 ID 순서대로 template-review 결과를 기록한다", () => {
  const sourceDiagram = buildTemplateDiagramJson("static-web-hosting", {
    projectSlug: "compiler-evidence-test",
    shortId: "static-web-hosting"
  });
  const input = {
    availableTemplates: [
      {
        id: "repository:z-template",
        title: "Z template",
        source: "repository" as const,
        sourceDiagram
      },
      {
        id: "repository:a-template",
        title: "A template",
        source: "repository" as const,
        sourceDiagram
      }
    ],
    unavailableTemplates: [
      {
        id: "brainboard:failed-capture",
        title: "Failed capture",
        source: "brainboard" as const,
        reason: "source unavailable"
      }
    ]
  };
  const before = structuredClone(input);

  const first = createArchitectureBoardCompilerEvidenceReport(input);
  const second = createArchitectureBoardCompilerEvidenceReport(input);

  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.templates.map((template) => template.id),
    ["repository:a-template", "repository:z-template"]
  );
  assert.equal(first.summary.availableTemplateCount, 2);
  assert.equal(first.unavailableTemplates.length, 1);
  assert.deepEqual(first.sourceValidation.summary, {
    sourceEvidenceCount: 3,
    availableTemplateCount: 2,
    unavailableTemplateCount: 1,
    validAvailableTemplateCount: 2,
    invalidAvailableTemplateCount: 0,
    findingCounts: {
      "node.missing_geometry": 0,
      "node.invalid_geometry": 0,
      "area.missing_geometry": 0,
      "area.invalid_geometry": 0,
      "edge.missing_endpoint": 0,
      "edge.dangling_endpoint": 0,
      "edge.duplicate_id": 0,
      "viewport.missing": 0,
      "viewport.invalid": 0
    }
  });
  assert.ok(first.templates.every((template) => template.referenceTemplateIds.length > 0));
  assert.ok(
    first.templates.every(
      (template) =>
        /^sha256:[0-9a-f]{64}$/u.test(template.diagramFingerprints.source) &&
        /^sha256:[0-9a-f]{64}$/u.test(template.diagramFingerprints.compiled)
    )
  );
  assert.equal(
    renderArchitectureBoardCompilerEvidenceReport(first),
    renderArchitectureBoardCompilerEvidenceReport(second)
  );
});

test("Compiler evidence report는 명시된 aggregate visual anomaly budget을 보고서에 고정한다", () => {
  const sourceDiagram = buildTemplateDiagramJson("static-web-hosting", {
    projectSlug: "compiler-evidence-test",
    shortId: "static-web-hosting"
  });
  const budget = createArchitectureBoardCompilerEvidenceRegressionBudget({
    nodeOverlapCount: 10_000,
    siblingAreaOverlapCount: 10_000,
    parentBoundaryViolationCount: 10_000,
    edgeCrossingCount: 10_000,
    edgeNodeIntersectionCount: 10_000,
    edgeAreaTitleIntersectionCount: 10_000,
    backwardEdgeCount: 10_000,
    supportLaneIntrusionCount: 10_000
  });

  const report = createArchitectureBoardCompilerEvidenceReport(
    {
      availableTemplates: [
        {
          id: "repository:static-web-hosting",
          title: "Static web hosting",
          source: "repository",
          sourceDiagram
        }
      ],
      unavailableTemplates: []
    },
    { aggregateAfterVisualAnomalyBudget: budget }
  );

  assert.deepEqual(report.regressionGuard, {
    status: "within-budget",
    aggregateAfterVisualAnomalyBudget: budget,
    violations: []
  });
});

// Template 사례가 늘어도 자동 배치는 기록된 시각 품질 상한을 넘기지 않아야 한다.
test("새 Template knowledge는 기존 시각 품질 기준을 넘는 배치를 선택하지 않는다", () => {
  const budget = createArchitectureBoardCompilerEvidenceRegressionBudget({
    nodeOverlapCount: 1,
    siblingAreaOverlapCount: 6,
    parentBoundaryViolationCount: 1,
    edgeCrossingCount: 89,
    edgeNodeIntersectionCount: 5,
    edgeAreaTitleIntersectionCount: 30,
    backwardEdgeCount: 4,
    supportLaneIntrusionCount: 4
  });

  const report = createArchitectureBoardCompilerEvidenceReport(
    collectArchitectureBoardCompilerEvidenceInput(),
    { aggregateAfterVisualAnomalyBudget: budget }
  );

  assert.equal(report.regressionGuard?.status, "within-budget");
});

test("evidence source는 29개 usable template과 1개 unavailable evidence를 분리한다", () => {
  const input = collectArchitectureBoardCompilerEvidenceInput();

  assert.equal(input.availableTemplates.length, 29);
  assert.equal(input.unavailableTemplates.length, 1);
  assert.deepEqual(
    input.availableTemplates.map((template) => template.id),
    [...input.availableTemplates.map((template) => template.id)].sort()
  );
});
