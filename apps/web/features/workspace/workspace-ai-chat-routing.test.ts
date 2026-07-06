import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolvePendingPreviewChatAction,
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

test("resolveWorkspaceAiChatAction no longer routes new service requests to pre-clarification", () => {
  const prompts = [
    "build a website",
    "create a login service",
    "웹사이트 하나 배포하고 싶어",
    "로그인 있는 작은 웹서비스가 필요해"
  ];

  for (const prompt of prompts) {
    assert.equal(
      resolveWorkspaceAiChatAction({
        boardHasResources: false,
        needsDraftClarification: true,
        prompt
      }),
      "draft",
      prompt
    );
  }
});

test("resolveWorkspaceAiChatAction keeps existing-board edit prompts on patch", () => {
  const prompts = [
    "add a database",
    "remove existing server",
    "여기에 로그인 기능 추가해줘",
    "스토리지 버킷도 넣어줘"
  ];

  for (const prompt of prompts) {
    assert.equal(
      resolveWorkspaceAiChatAction({
        boardHasResources: true,
        needsDraftClarification: true,
        prompt
      }),
      "patch",
      prompt
    );
  }
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
      prompt: "start over with a new diagram"
    }),
    "draft"
  );
});

test("resolvePendingPreviewChatAction keeps new prompts as fresh drafts while refinements patch the preview", () => {
  assert.equal(
    resolvePendingPreviewChatAction({
      needsDraftClarification: true,
      prompt: "create a file upload website"
    }),
    "draft"
  );
  assert.equal(
    resolvePendingPreviewChatAction({
      needsDraftClarification: true,
      prompt: "organize this as a static intro website"
    }),
    "patch"
  );
});
