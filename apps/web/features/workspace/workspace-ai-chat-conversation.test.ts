import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceAiChatActiveScopeStorageKey,
  createWorkspaceAiChatComposerStates,
  getAdjacentWorkspaceAiChatScope,
  getWorkspaceAiChatScopeDefinition,
  isWorkspaceAiChatScope,
  readStoredActiveChatScope,
  storeActiveChatScope,
  workspaceAiChatScopes
} from "./workspace-ai-chat-conversation";

test("AI Chat은 세 개의 독립 대화 범위를 제공한다", () => {
  assert.deepEqual(workspaceAiChatScopes, ["draft", "errors", "preview"]);
  assert.equal(getWorkspaceAiChatScopeDefinition("draft").label, "설계 제안");
  assert.equal(getWorkspaceAiChatScopeDefinition("errors").label, "오류 분석");
  assert.equal(getWorkspaceAiChatScopeDefinition("preview").label, "에이전트 리뷰");
  assert.equal(getWorkspaceAiChatScopeDefinition("draft").inputAvailable, true);
  assert.equal(getWorkspaceAiChatScopeDefinition("errors").inputAvailable, false);
});

test("AI Chat launcher는 프로젝트별 마지막 대화를 저장하고 잘못된 값은 무시한다", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };

  storeActiveChatScope("project-1", "preview", storage);
  assert.equal(readStoredActiveChatScope("project-1", storage), "preview");
  values.set(createWorkspaceAiChatActiveScopeStorageKey("project-1"), "invalid");
  assert.equal(readStoredActiveChatScope("project-1", storage), "draft");
});

test("AI Chat 탭은 화살표 이동에서 순환한다", () => {
  assert.equal(getAdjacentWorkspaceAiChatScope("draft", 1), "errors");
  assert.equal(getAdjacentWorkspaceAiChatScope("draft", -1), "preview");
  assert.equal(getAdjacentWorkspaceAiChatScope("preview", 1), "draft");
});

test("AI Chat 대화별 composer 상태는 서로 다른 객체로 시작한다", () => {
  const states = createWorkspaceAiChatComposerStates();

  assert.notEqual(states.draft, states.errors);
  assert.notEqual(states.errors, states.preview);
  assert.deepEqual(states.draft, { value: "", voiceStatusMessage: "" });
});

test("AI Chat은 저장된 대화 범위 값을 검증한다", () => {
  assert.equal(isWorkspaceAiChatScope("draft"), true);
  assert.equal(isWorkspaceAiChatScope("errors"), true);
  assert.equal(isWorkspaceAiChatScope("preview"), true);
  assert.equal(isWorkspaceAiChatScope("simulation"), false);
  assert.equal(isWorkspaceAiChatScope(null), false);
});
