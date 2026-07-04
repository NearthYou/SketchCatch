import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceAiChatDockSource = readWorkspaceFile("WorkspaceAiChatDock.tsx");
const workspaceAiDraftFollowUpSource = readWorkspaceFile("workspace-ai-draft-follow-up.ts");
const workspaceAiPanelPiecesSource = readWorkspaceFile("WorkspaceAiPanelPieces.tsx");
const workspaceAiPanelOptionsSource = readWorkspaceFile("workspace-ai-panel-options.ts");
const stylesSource = readWorkspaceFile("workspace.module.css");

test("workspace AI chat asks follow-up questions instead of showing fixable guardrail warnings", () => {
  assert.match(workspaceAiChatDockSource, /draftFollowUpSession/);
  assert.match(workspaceAiChatDockSource, /planArchitectureDraftPreview/);
  assert.match(workspaceAiChatDockSource, /resolveArchitectureDraftFollowUpAnswer/);
  assert.match(workspaceAiChatDockSource, /createQuestionFromDraftError/);
  assert.match(workspaceAiDraftFollowUpSource, /ask_follow_up/);
  assert.match(workspaceAiChatDockSource, /질문/);
  assert.match(workspaceAiChatDockSource, /명확한 아키텍처 단서/);
  assert.match(workspaceAiDraftFollowUpSource, /unsupported_resource_omitted/);
  assert.match(workspaceAiDraftFollowUpSource, /unsupported_requirement_substituted/);
  assert.doesNotMatch(workspaceAiChatDockSource, /WorkspaceAiGuardrailWarnings/);
  assert.match(workspaceAiPanelPiecesSource, /unsupported_resource_omitted/);
  assert.match(workspaceAiPanelPiecesSource, /unsupported_requirement_substituted/);
});

test("workspace AI draft preview exposes only apply, cancel, and regenerate actions", () => {
  assert.match(workspaceAiChatDockSource, /draft === null/);
  assert.match(workspaceAiChatDockSource, /생성/);
  assert.match(workspaceAiChatDockSource, /취소/);
  assert.match(workspaceAiChatDockSource, /다시 생성/);
  assert.doesNotMatch(workspaceAiChatDockSource, /초안 미리보기 생성/);
});

test("workspace AI scenario helper labels keep prompt-first wording", () => {
  assert.match(workspaceAiPanelOptionsSource, /자연어 기준으로 자동 판단/);
  assert.match(workspaceAiPanelOptionsSource, /serverless_function/);
  assert.match(workspaceAiChatDockSource, /useState<ArchitectureDraftScenarioHint>\("auto"\)/);
});

test("workspace AI prompt guide uses beginner-friendly examples", () => {
  assert.match(workspaceAiChatDockSource, /프롬프트 작성 가이드/);
  assert.match(workspaceAiChatDockSource, /그냥 이렇게 시작해도 돼요/);
  assert.match(workspaceAiChatDockSource, /정보가 부족하면 질문부터 할게요/);
  assert.match(workspaceAiPanelOptionsSource, /웹사이트 하나 배포하고 싶어/);
  assert.match(workspaceAiPanelOptionsSource, /파일 업로드 페이지가 필요해/);
  assert.match(workspaceAiPanelOptionsSource, /로그인 있는 작은 웹서비스가 필요해/);
  assert.match(stylesSource, /\.aiPromptGuide\s*{/);
  assert.match(stylesSource, /\.aiPromptChip\s*{/);
});

test("workspace AI chat history is persisted per project", () => {
  assert.match(workspaceAiChatDockSource, /createWorkspaceAiChatStorageKey/);
  assert.match(workspaceAiChatDockSource, /localStorage\.getItem/);
  assert.match(workspaceAiChatDockSource, /localStorage\.setItem/);
  assert.match(workspaceAiChatDockSource, /projectId/);
  assert.match(workspaceAiChatDockSource, /messages/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}
