import assert from "node:assert/strict";
import test from "node:test";
import { buildTemplateDiagramJson } from "@sketchcatch/types";
import {
  createArchitectureBoardCompilerEvidenceReport,
  renderArchitectureBoardCompilerEvidenceReport
} from "./architecture-board-compiler-evidence-report";
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
  assert.ok(first.templates.every((template) => template.referenceTemplateIds.length > 0));
  assert.equal(
    renderArchitectureBoardCompilerEvidenceReport(first),
    renderArchitectureBoardCompilerEvidenceReport(second)
  );
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
