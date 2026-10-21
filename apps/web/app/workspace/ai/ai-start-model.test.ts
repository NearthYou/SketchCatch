import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveAiStartEntryDraft } from "./ai-start-model";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("Repository analysis can initialize a fresh AI design chat without a saved project", () => {
  assert.deepEqual(
    resolveAiStartEntryDraft({
      initialProjectName: "Audience Live Check",
      storedDraft: null,
      updatedAt: "2026-07-24T00:00:00.000Z"
    }),
    {
      projectName: "Audience Live Check",
      startMode: "ai",
      updatedAt: "2026-07-24T00:00:00.000Z"
    }
  );
});

test("AI patch raw draft는 DiagramJson을 직접 계획하지 않고 Compiler 입력만 보존한다", () => {
  const source = readFileSync(join(currentDir, "ai-start-model.ts"), "utf8");

  assert.match(source, /function createDraftFromPatch/);
  assert.match(source, /architectureJson:\s*preview\.proposedArchitectureJson/);
  assert.doesNotMatch(source, /getDiagramJsonForArchitectureDraft/);
  assert.doesNotMatch(source, /diagramJson:\s*getDiagramJsonForArchitectureDraft/);
});
