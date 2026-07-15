import assert from "node:assert/strict";
import test from "node:test";
import {
  isWorkspaceAiChatAbortError,
  WorkspaceAiChatRequestRegistry
} from "./workspace-ai-chat-request";

test("AI Chat 요청은 대화별로 독립되고 같은 대화의 이전 요청만 중지한다", () => {
  const registry = new WorkspaceAiChatRequestRegistry();
  const firstDraft = registry.begin("draft");
  const errors = registry.begin("errors");
  const nextDraft = registry.begin("draft");

  assert.equal(firstDraft.signal.aborted, true);
  assert.equal(errors.signal.aborted, false);
  assert.equal(nextDraft.signal.aborted, false);
  assert.equal(registry.isActive("draft", firstDraft), false);
  assert.equal(registry.isActive("draft", nextDraft), true);
  assert.equal(registry.isActive("errors", errors), true);

  registry.complete("draft", firstDraft);
  assert.equal(registry.isActive("draft", nextDraft), true);
  assert.equal(registry.cancel("draft"), true);
  assert.equal(nextDraft.signal.aborted, true);
  assert.equal(registry.isActive("draft", nextDraft), false);
  assert.equal(errors.signal.aborted, false);
});

test("AI Chat 요청 전체 정리는 모든 대화의 fetch signal을 중지한다", () => {
  const registry = new WorkspaceAiChatRequestRegistry();
  const draft = registry.begin("draft");
  const preview = registry.begin("preview");

  registry.cancelAll();

  assert.equal(draft.signal.aborted, true);
  assert.equal(preview.signal.aborted, true);
  assert.equal(registry.cancel("draft"), false);
});

test("AbortError만 사용자 요청 실패와 분리한다", () => {
  const abortError = new Error("stopped");
  abortError.name = "AbortError";

  assert.equal(isWorkspaceAiChatAbortError(abortError), true);
  assert.equal(isWorkspaceAiChatAbortError(new Error("failed")), false);
  assert.equal(isWorkspaceAiChatAbortError("AbortError"), false);
});
