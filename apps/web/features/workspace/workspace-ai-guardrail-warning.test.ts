import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceAiPanelSource = readWorkspaceFile("WorkspaceAiPanel.tsx");
const workspaceAiPanelPiecesSource = readWorkspaceFile("WorkspaceAiPanelPieces.tsx");
const stylesSource = readWorkspaceFile("workspace.module.css");

test("workspace AI draft result exposes guardrail warnings", () => {
  assert.match(workspaceAiPanelSource, /WorkspaceAiGuardrailWarnings/);
  assert.match(workspaceAiPanelSource, /createDraftWarnings/);
  assert.match(workspaceAiPanelPiecesSource, /지원 범위 경고/);
  assert.match(workspaceAiPanelPiecesSource, /unsupported_resource_omitted/);
  assert.match(workspaceAiPanelPiecesSource, /unsupported_requirement_substituted/);
  assert.match(workspaceAiPanelPiecesSource, /board_replacement_required/);
  assert.match(workspaceAiPanelPiecesSource, /low_budget_rds_cost/);
  assert.match(stylesSource, /\.aiWarning\s*{/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
