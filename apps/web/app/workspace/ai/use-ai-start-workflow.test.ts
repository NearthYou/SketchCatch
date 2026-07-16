import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("AI 시작 Draft와 Patch는 Compiler proposal을 같은 preview와 승인 경계로 사용한다", () => {
  const source = readFileSync(join(currentDir, "use-ai-start-workflow.ts"), "utf8");

  assert.match(source, /compileArchitectureDraftProposal/);
  assert.doesNotMatch(source, /getDiagramJsonForArchitectureDraft/);
  assert.match(source, /showDraft\(nextDraft, baseDiagram, createPatchSummary\(response\)\)/);
  assert.match(source, /saveProjectDraft\(\{ diagramJson: compilationProposal\.diagram, projectId \}\)/);
  assert.match(source, /canApprove:[\s\S]*compilationProposal !== null/);
});
