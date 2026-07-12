import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyWorkspaceAiChatPrompt,
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

test("classifyWorkspaceAiChatPrompt accepts diagram generation and edit requests", () => {
  const prompts = [
    "create a login service diagram",
    "upload images and serve them from a web app",
    "add an S3 bucket for uploads",
    "remove the existing database",
    "정적 웹사이트 다이어그램 만들어줘",
    "로그인 있는 작은 웹서비스가 필요해",
    "구글 플레이스토어에 올릴 앱 하나 만들고 싶어",
    "여기에 데이터베이스 하나 추가해줘",
    "db 지우고 싶어",
    "여기에서 db는 지워도 될거같아"
  ];

  for (const prompt of prompts) {
    assert.equal(classifyWorkspaceAiChatPrompt(prompt), "architecture", prompt);
  }
});

test("classifyWorkspaceAiChatPrompt blocks unrelated chat before generation or patching", () => {
  const prompts = [
    "hello",
    "ㅋㅋㅋ",
    "점심 뭐 먹지?",
    "오늘 날씨 어때?",
    "주식 추천해줘"
  ];

  for (const prompt of prompts) {
    assert.equal(classifyWorkspaceAiChatPrompt(prompt), "unrelated", prompt);
  }
});

test("classifyWorkspaceAiChatPrompt asks for more detail on vague change requests", () => {
  const prompts = ["해줘", "수정해줘", "make it better", "좋게 바꿔줘"];

  for (const prompt of prompts) {
    assert.equal(classifyWorkspaceAiChatPrompt(prompt), "ambiguous", prompt);
  }
});

test("classifyWorkspaceAiChatPrompt treats bare resource names as ambiguous", () => {
  const prompts = ["db", "s3", "rds", "api gateway"];

  for (const prompt of prompts) {
    assert.equal(classifyWorkspaceAiChatPrompt(prompt), "ambiguous", prompt);
  }
});
