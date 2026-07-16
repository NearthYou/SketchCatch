import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("AI 시작 화면은 Board 적용 전에 Compiler 제안 근거를 보여준다", () => {
  const source = readFileSync(join(currentDir, "workspace-ai-start-client.tsx"), "utf8");
  const summaryIndex = source.indexOf("ArchitectureBoardCompilationSummary");
  const approvalIndex = source.indexOf("onClick={() => void workflow.approveDraft()}");

  assert.match(source, /ArchitectureBoardCompilationSummary/);
  assert.match(source, /proposal=\{workflow\.compilationProposal\}/);
  assert.ok(summaryIndex >= 0);
  assert.ok(approvalIndex > summaryIndex);
});
