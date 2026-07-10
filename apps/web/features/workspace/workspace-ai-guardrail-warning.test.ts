import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceAiChatDockSource = readWorkspaceFile("WorkspaceAiChatDock.tsx");
const workspaceAiDraftFollowUpSource = readWorkspaceFile("workspace-ai-draft-follow-up.ts");
const workspaceAiPanelPiecesSource = readWorkspaceFile("WorkspaceAiPanelPieces.tsx");
const workspaceAiPanelOptionsSource = readWorkspaceFile("workspace-ai-panel-options.ts");
const stylesSource = readWorkspaceFile("workspace.module.css");
const appAiWorkspaceClientSource = readAppWorkspaceFile("AiWorkspaceClient.tsx");
const appArchitectureDraftPanelSource = readAppWorkspaceFile("ArchitectureDraftPanel.tsx");
const appWorkspaceOptionsSource = readAppWorkspaceFile("workspace-options.ts");

test("workspace AI chat asks follow-up questions instead of showing fixable guardrail warnings", () => {
  assert.match(workspaceAiChatDockSource, /draftFollowUpSession/);
  assert.match(workspaceAiChatDockSource, /planArchitectureDraftPreview/);
  assert.match(workspaceAiChatDockSource, /resolveArchitectureDraftFollowUpAnswer/);
  assert.match(workspaceAiDraftFollowUpSource, /ask_follow_up/);
  assert.match(workspaceAiChatDockSource, /질문/);
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

test("workspace AI chat does not expose auxiliary draft selectors", () => {
  assert.doesNotMatch(workspaceAiChatDockSource, /WorkspaceAiSelect/);
  assert.doesNotMatch(workspaceAiChatDockSource, /scenarioOptions/);
  assert.doesNotMatch(workspaceAiChatDockSource, /budgetOptions/);
  assert.doesNotMatch(workspaceAiChatDockSource, /trafficOptions/);
  assert.doesNotMatch(workspaceAiChatDockSource, /securityOptions/);
  assert.doesNotMatch(workspaceAiChatDockSource, /label="보조 선택"/);
  assert.doesNotMatch(workspaceAiChatDockSource, /label="예산"/);
  assert.doesNotMatch(workspaceAiChatDockSource, /label="방문자"/);
  assert.doesNotMatch(workspaceAiChatDockSource, /label="보호 기준"/);
  assert.doesNotMatch(workspaceAiPanelOptionsSource, /scenarioOptions/);
  assert.doesNotMatch(appAiWorkspaceClientSource, /scenarioHint/);
  assert.doesNotMatch(appAiWorkspaceClientSource, /securityPriority/);
  assert.doesNotMatch(appArchitectureDraftPanelSource, /scenarioOptions/);
  assert.doesNotMatch(appArchitectureDraftPanelSource, /budgetOptions/);
  assert.doesNotMatch(appArchitectureDraftPanelSource, /trafficOptions/);
  assert.doesNotMatch(appArchitectureDraftPanelSource, /securityOptions/);
  assert.doesNotMatch(appWorkspaceOptionsSource, /scenarioOptions/);
});

test("workspace AI chat does not expose beginner prompt guide chips", () => {
  assert.doesNotMatch(workspaceAiChatDockSource, /프롬프트 작성 가이드/);
  assert.doesNotMatch(workspaceAiChatDockSource, /그냥 이렇게 시작해도 돼요/);
  assert.doesNotMatch(workspaceAiChatDockSource, /promptGuideExamples/);
  assert.doesNotMatch(workspaceAiPanelOptionsSource, /promptGuideExamples/);
});

test("workspace AI chat history is persisted per project", () => {
  assert.match(workspaceAiChatDockSource, /createWorkspaceAiChatStorageKey/);
  assert.match(workspaceAiChatDockSource, /localStorage\.getItem/);
  assert.match(workspaceAiChatDockSource, /localStorage\.setItem/);
  assert.match(workspaceAiChatDockSource, /projectId/);
  assert.match(workspaceAiChatDockSource, /messages/);
});

test("workspace AI chat storage skips project changes until matching messages are loaded", () => {
  const storeEffectIndex = workspaceAiChatDockSource.indexOf("storeChatMessages(projectId, messages)");
  const projectLoadEffectIndex = workspaceAiChatDockSource.indexOf("setMessages(readStoredChatMessages(projectId))");

  assert.match(workspaceAiChatDockSource, /loadedProjectIdRef/);
  assert.match(workspaceAiChatDockSource, /loadedProjectIdRef\.current !== projectId/);
  assert.ok(storeEffectIndex >= 0);
  assert.ok(projectLoadEffectIndex >= 0);
  assert.ok(
    storeEffectIndex < projectLoadEffectIndex,
    "Storage guard effect must run before the project load effect so old messages are not written to the new project key"
  );
});

test("workspace AI chat scrolls to the latest message when the dock opens", () => {
  assert.match(workspaceAiChatDockSource, /lastVisibleMessageId/);
  assert.match(workspaceAiChatDockSource, /scrollChatTranscriptToBottom/);
  assert.match(workspaceAiChatDockSource, /window\.requestAnimationFrame/);
  assert.match(workspaceAiChatDockSource, /isOpen/);
  assert.match(workspaceAiChatDockSource, /top:\s*transcript\.scrollHeight/);
});

test("workspace AI clarification supports multi-select suggestion chips", () => {
  assert.match(workspaceAiChatDockSource, /selectedSuggestionLabelsByMessageId/);
  assert.match(workspaceAiChatDockSource, /toggleSuggestionSelection/);
  assert.match(workspaceAiChatDockSource, /submitSelectedSuggestions/);
  assert.match(workspaceAiChatDockSource, /selectionMode/);
  assert.match(workspaceAiChatDockSource, /선택 완료/);
  assert.match(stylesSource, /\.aiChatSuggestionButtonSelected\s*{/);
  assert.match(stylesSource, /\.aiChatSelectionSubmitButton\s*{/);
});

test("workspace AI patch clarification can decline optional resource additions", () => {
  assert.match(workspaceAiChatDockSource, /NO_RESOURCE_ADDITION_SUGGESTION/);
  assert.match(workspaceAiChatDockSource, /isNoResourceAdditionSuggestion/);
  assert.match(workspaceAiChatDockSource, /NO_RESOURCE_ADDITION_MESSAGE/);
  assert.match(workspaceAiChatDockSource, /setPatchPreviewModel\(null\)/);
});

function readWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), "utf8");
}

function readAppWorkspaceFile(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(`../../app/workspace/${fileName}`, import.meta.url)), "utf8");
}
