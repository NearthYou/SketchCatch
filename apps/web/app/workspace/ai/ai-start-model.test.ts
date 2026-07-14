import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("AI patch raw draft는 DiagramJson을 직접 계획하지 않고 Compiler 입력만 보존한다", () => {
  const source = readFileSync(join(currentDir, "ai-start-model.ts"), "utf8");

  assert.match(source, /function createDraftFromPatch/);
  assert.match(source, /architectureJson:\s*preview\.proposedArchitectureJson/);
  assert.doesNotMatch(source, /getDiagramJsonForArchitectureDraft/);
  assert.doesNotMatch(source, /diagramJson:\s*getDiagramJsonForArchitectureDraft/);
});
