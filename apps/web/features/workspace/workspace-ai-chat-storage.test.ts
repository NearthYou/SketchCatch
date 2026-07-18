import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceAiChatStorageKey } from "./workspace-ai-chat-storage";

test("Workspace AI chat storage key는 project별 기존 localStorage namespace를 유지한다", () => {
  assert.equal(
    createWorkspaceAiChatStorageKey("project-1"),
    "sketchcatch.workspaceAiChat.project-1"
  );
});
