import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveWorkspaceAiChatAction,
  resolveWorkspaceAiChatMode
} from "./workspace-ai-chat-routing";

test("resolveWorkspaceAiChatMode keeps empty boards on the draft generation flow", () => {
  assert.equal(
    resolveWorkspaceAiChatMode({
      boardHasResources: false,
      prompt: "upload images and serve them from a web app"
    }),
    "draft"
  );
});

test("resolveWorkspaceAiChatAction keeps existing-board prompts on patch even when draft clarification matches", () => {
  assert.equal(
    resolveWorkspaceAiChatAction({
      boardHasResources: true,
      needsDraftClarification: true,
      prompt: "build a website"
    }),
    "patch"
  );
});

test("resolveWorkspaceAiChatAction asks draft clarification only on draft generation", () => {
  assert.equal(
    resolveWorkspaceAiChatAction({
      boardHasResources: false,
      needsDraftClarification: true,
      prompt: "build a website"
    }),
    "draft_clarification"
  );
});

test("resolveWorkspaceAiChatMode routes existing boards to patch preview by default", () => {
  assert.equal(
    resolveWorkspaceAiChatMode({
      boardHasResources: true,
      prompt: "add an S3 bucket for uploaded files"
    }),
    "patch"
  );
});

test("resolveWorkspaceAiChatMode lets explicit fresh-start requests replace an existing board", () => {
  assert.equal(
    resolveWorkspaceAiChatMode({
      boardHasResources: true,
      prompt: "기존 다이어그램 무시하고 처음부터 다시 만들어줘"
    }),
    "draft"
  );
});
