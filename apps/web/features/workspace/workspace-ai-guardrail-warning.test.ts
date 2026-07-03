import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceAiPanelSource = readWorkspaceFile("WorkspaceAiPanel.tsx");
const workspaceAiPanelPiecesSource = readWorkspaceFile("WorkspaceAiPanelPieces.tsx");
const workspaceAiPanelOptionsSource = readWorkspaceFile("workspace-ai-panel-options.ts");
const stylesSource = readWorkspaceFile("workspace.module.css");

test("workspace AI draft result exposes guardrail warnings", () => {
  assert.match(workspaceAiPanelSource, /WorkspaceAiGuardrailWarnings/);
  assert.match(workspaceAiPanelSource, /createDraftWarnings/);
  assert.match(workspaceAiPanelSource, /Natural Language Diagramming/);
  assert.match(workspaceAiPanelSource, /자연어 다이어그램/);
  assert.match(workspaceAiPanelPiecesSource, /지원 범위 경고/);
  assert.match(workspaceAiPanelPiecesSource, /unsupported_resource_omitted/);
  assert.match(workspaceAiPanelPiecesSource, /unsupported_requirement_substituted/);
  assert.match(workspaceAiPanelPiecesSource, /board_replacement_required/);
  assert.match(workspaceAiPanelPiecesSource, /low_budget_rds_cost/);
  assert.match(stylesSource, /\.aiWarning\s*{/);
});

test("workspace AI draft preview exposes only apply, cancel, and regenerate actions", () => {
  assert.match(workspaceAiPanelSource, /draft === null \? \(/);
  assert.match(workspaceAiPanelSource, /초안 미리보기 생성/);
  assert.match(workspaceAiPanelSource, /생성/);
  assert.match(workspaceAiPanelSource, /취소/);
  assert.match(workspaceAiPanelSource, /다시 생성/);
  assert.ok(
    workspaceAiPanelSource.indexOf("draft === null ? (") <
      workspaceAiPanelSource.indexOf("초안 미리보기 생성")
  );
  assert.ok(
    workspaceAiPanelSource.indexOf("초안 미리보기 생성") <
      workspaceAiPanelSource.indexOf("{draft !== null ? (")
  );
});

test("workspace AI scenario helper labels keep prompt-first wording", () => {
  assert.match(workspaceAiPanelOptionsSource, /자연어 기준으로 자동 판단/);
  assert.match(workspaceAiPanelOptionsSource, /serverless_function/);
  assert.match(workspaceAiPanelSource, /useState<ArchitectureDraftScenarioHint>\("auto"\)/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
