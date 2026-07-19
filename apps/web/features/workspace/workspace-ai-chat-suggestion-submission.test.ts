import assert from "node:assert/strict";
import test from "node:test";
import {
  getWorkspaceAiChatSuggestionPresentation,
  WorkspaceAiChatSuggestionSubmissionRegistry
} from "./workspace-ai-chat-suggestion-submission";

test("a chat question can submit its selected option only once", () => {
  const registry = new WorkspaceAiChatSuggestionSubmissionRegistry();

  assert.equal(registry.claim("question-1"), true);
  assert.equal(registry.claim("question-1"), false);
  assert.equal(registry.claim("question-2"), true);
});

test("clearing chat state permits selections for a new conversation", () => {
  const registry = new WorkspaceAiChatSuggestionSubmissionRegistry();
  registry.claim("question-1");
  registry.clear();

  assert.equal(registry.claim("question-1"), true);
});

test("submitted choices stay visible while every option for that question is disabled", () => {
  assert.deepEqual(
    getWorkspaceAiChatSuggestionPresentation({
      hasSubmittedSuggestion: true,
      isChatBusy: false,
      isSelected: true
    }),
    { disabled: true, selectionState: "\u2713 \uC120\uD0DD\uB428" }
  );
  assert.deepEqual(
    getWorkspaceAiChatSuggestionPresentation({
      hasSubmittedSuggestion: true,
      isChatBusy: false,
      isSelected: false
    }),
    { disabled: true, selectionState: null }
  );
});
