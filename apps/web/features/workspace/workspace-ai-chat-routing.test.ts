import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveWorkspaceAiChatAction,
  resolveWorkspaceAiChatMode,
  shouldInterruptPatchClarificationForDraft
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

test("resolveWorkspaceAiChatAction asks beginner-friendly draft questions for new service requests on existing boards", () => {
  const prompts = [
    "로그인 있는 작은 웹서비스 하나 만들고 싶어",
    "예약 신청 받는 사이트 만들어줘",
    "상품 판매하는 앱 하나 만들고 싶어",
    "관리자 페이지 있는 서비스 구축하고 싶어",
    "웹사이트 하나 배포하고 싶어",
    "최소한의 api만 넣은 거 하나 만들어줘",
    "로그인이 있는 서비스를 만들고 싶어"
  ];

  for (const prompt of prompts) {
    assert.equal(
      resolveWorkspaceAiChatAction({
        boardHasResources: true,
        needsDraftClarification: true,
        prompt
      }),
      "draft_clarification",
      prompt
    );
  }
});

test("resolveWorkspaceAiChatAction keeps existing-board edit prompts on patch", () => {
  const cases = [
    { needsDraftClarification: true, prompt: "여기에 로그인 기능 추가해줘" },
    { needsDraftClarification: false, prompt: "데이터베이스 하나 추가해줘" },
    { needsDraftClarification: false, prompt: "기존 서버 삭제해줘" },
    { needsDraftClarification: false, prompt: "스토리지 버킷도 넣어줘" }
  ];

  for (const item of cases) {
    assert.equal(
      resolveWorkspaceAiChatAction({
        boardHasResources: true,
        needsDraftClarification: item.needsDraftClarification,
        prompt: item.prompt
      }),
      "patch",
      item.prompt
    );
  }
});

test("shouldInterruptPatchClarificationForDraft lets new service requests escape resource questions", () => {
  assert.equal(
    shouldInterruptPatchClarificationForDraft({
      boardHasResources: true,
      needsDraftClarification: true,
      prompt: "로그인 있는 작은 웹서비스 하나 만들고 싶어"
    }),
    true
  );
  assert.equal(
    shouldInterruptPatchClarificationForDraft({
      boardHasResources: true,
      needsDraftClarification: true,
      prompt: "여기에 로그인 기능 추가해줘"
    }),
    false
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
